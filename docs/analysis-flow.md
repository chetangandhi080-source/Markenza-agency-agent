# Markenza AI — Analysis flow (for reference)

This is the actual data + control flow that runs when a new lead
appears, traced end to end. Use it when debugging, extending prompts,
or onboarding the React frontend later.

## 1. Lead discovery

Source: `outreach-discover` edge function.

Inputs (POST body):
```json
{ "searchUrls": ["https://www.linkedin.com/search/..."], "maxItems": 25 }
```

Steps:
1. Auth: resolve caller (user JWT **or** cron secret).
2. Call Apify actor `APIFY_LINKEDIN_ACTOR` (default `bebity/linkedin-profile-scraper`)
   with `{ searchUrls, maxItems }`. Poll until the run finishes (90s cap).
3. Normalize each result via `normalizeLinkedInProfile()`.
4. Skip if `linkedin_url` already exists in `leads`.
5. Insert a row in `leads` with `status = 'new'`, `source = 'apify_linkedin'`,
   `raw_profile` containing the full Apify payload.
6. Enqueue one `outreach.generate` job per new lead.
7. Log to `activity_log` with `action = 'leads.discovered'`.

## 2. Lead analysis + draft

Source: `outreach-generate` edge function.

Inputs:
```json
{ "lead_id": "uuid", "step": 1 }
```

Steps:
1. Load `settings` (offer summary, ICP personas) for the org.
2. Load the lead row.
3. Call Hermes (`json` mode, system = `SYSTEM_PERSONA`, user =
   `leadAnalysisPrompt(lead, offer)`) to produce:
   ```json
   {
     "fit_score": 0-100,
     "fit_reason": "...",
     "observed_gap": "...",
     "personalization_hooks": ["...", "..."],
     "recommended_channel": "email" | "linkedin_dm",
     "recommended_offer": "AI Automation" | "Google Ads" | "Performance Marketing" | "White-label"
   }
   ```
4. Persist `enrichment` + `score` on the lead. If `fit_score < 30` mark
   the lead `closed_lost` and stop.
5. Pick channel from `recommended_channel`; call `emailDraftPrompt` or
   `linkedinDraftPrompt` to get the step-1 body.
6. Insert an `outreach_messages` row:
   - email -> `status = 'queued'` and enqueue an `outreach.send` job
   - linkedin -> `status = 'draft'` (no auto-send)
7. Update lead `status = 'message_ready'`.
8. Log `message.generated` with channel + step + score.

## 3. Send

Source: `outreach-send` edge function. Two paths.

### Email
- Requires the lead row to have `email` populated. (If the Apify scraper
  didn't return an email, the agent stays in `message_ready` and you
  collect it manually in Supabase Studio, then re-trigger by setting
  the message to `queued` and re-enqueuing.)
- Connects to Gmail SMTP over TLS (port 465), authenticates with
  `SMTP_USER` + `SMTP_PASS` (App Password, **not** your real password).
- Sends `From: SMTP_FROM`, `Subject: <message.subject>`,
  `Message-ID: <uuid@markenza.ai>`.
- Marks the message `sent` with `provider_msg_id = <message-id>`.
- Updates lead `status = 'contacted'`, `last_touched_at = now()`.
- Enqueues `outreach.generate` for step+1 at +3 / +5 days.
- Logs `email.sent`.

### LinkedIn (manual)
- User copies the body from Supabase Studio, sends it in LinkedIn.
- Then either edits the row in Studio to status `sent`, or hits:
  ```http
  POST /functions/v1/outreach-send
  { "message_id": "...", "action": "linkedin_mark_sent" }
  ```
- Same follow-up scheduling as email.

## 4. Follow-ups

Source: `outreach-followup` edge function. Runs twice a day from the
orchestrator.

- Find all leads with `status = 'contacted'` and
  `last_touched_at <= now() - 3 days`.
- Skip any with `cooldown_until > now()`.
- Enqueue `outreach.generate` with `step = 2`.
- The same `outreach-generate` function generates step 2 using the
  same prompts; it doesn't need a separate code path because prompts
  carry the per-step guidance.

If a reply is detected (status manually set to `replied` or
`meeting_booked`), the follow-up scanner ignores the lead because it
filters on `status = 'contacted'`.

## 5. Content

Source: `content-research` and `content-generate` edge functions.

### Research (weekly)
- Pull the last 20 topics to avoid duplicates.
- Pull the org's offer summary.
- Ask Hermes (`json` mode) for `count` topics that pass the
  `contentTopicPrompt` rules: specific, contrarian or proof-based,
  one of the 5 pillars, no repeat.
- Insert as `content_topics` with `status = 'idea'`.

### Generate (daily)
- Take a topic id + format (`text` | `carousel` | `thread`).
- Pull up to 3 most recent published/approved posts as voice examples.
- Ask Hermes to draft the post using `contentPostPrompt`.
- Insert as `content_posts` with `status = 'pending_approval'`.
- Mark the source topic `status = 'used'`.

You (the user) approve posts in Supabase Studio by setting status to
`approved`, posting them on LinkedIn, then setting `published_at` +
`publish_url`.

## 6. Orchestrator

Source: `orchestrator` edge function. Runs every 15 minutes via
pg_cron.

Per tick:
1. Drain up to 5 pending jobs from `jobs`:
   - Look up the function name from the job kind
   - POST the payload back to that function (service-role auth)
   - Mark the job `succeeded` or requeue with exponential backoff
2. Enqueue periodic jobs:
   - 07:00 UTC: `content.research` (5 topics)
   - 08:00 UTC Monday: `content.research` (7 topics)
   - 10:00 / 16:00 UTC: `outreach.followup`

## 7. Auth + multi-tenant

- `auth.users` is the source of truth. The DB trigger `handle_new_user`
  creates the org (singleton "Markenza"), profile, and settings row.
- RLS on every table filters by `org_id = public.current_org_id()`,
  which reads from `profiles` for `auth.uid()`.
- Service role bypasses RLS and is used by edge functions for
  cross-table orchestration.
- The cron path is authenticated by the `CRON_SECRET` bearer token; the
  orchestrator looks up the first org to scope operations.

## 8. Why this layout

- **One orchestrator, many agents.** New agents = new edge function
  + add to the kind map. No monolith.
- **Queue, not direct calls.** Long-running agent work goes through
  `jobs` so partial failures don't block the tick.
- **Hermes JSON mode for structured outputs.** Falls back to a
  one-shot retry with stricter instructions.
- **Manual approval on the irreversible surfaces.** LinkedIn DMs and
  content posts require a human flip; emails auto-send because the
  blast radius is bounded by `daily_email_cap` and the SMTP rate.
