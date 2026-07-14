# Phase 2 — Hermes 3 wires in *(current state)*

> Goal: replace the manual drafting path with Hermes 3, end-to-end.
> Keep the manual approval gates on LinkedIn DMs and content posts.

## What this phase does

- [x] Hermes 3 client (`supabase/functions/_shared/hermes.ts`)
- [x] Per-task prompts (`prompts.ts`): analysis, email draft, DM draft,
      topic research, post draft
- [x] `outreach-generate`: lead analysis → enrichment + draft
- [x] `outreach-send`: SMTP send with manual LinkedIn tick
- [x] `outreach-followup`: 3-day cadence scanner
- [x] `content-research`: weekly topic ideation
- [x] `content-generate`: post draft (text / carousel / thread)
- [x] Orchestrator: every-15-min drain + periodic scheduling
- [x] pg_cron schedule
- [x] Auth trigger, RLS, single-user setup
- [x] Deploy + smoke + tick scripts

## What still needs human-in-the-loop

- **Every LinkedIn DM** is written to `outreach_messages` as `draft`
  and never sent automatically. Chetan copies + pastes.
- **Every content post** is written as `pending_approval`. Chetan
  reviews, edits, and posts manually.

## What still auto-sends

- **Emails** auto-send once `outreach-generate` queues them. The
  `daily_email_cap` setting caps volume.

## What this phase does NOT do

- A/B test subject lines
- Detect replies automatically (manual flag for now)
- Score the quality of Hermes'' output
- Cache or memoize Hermes calls
- Stream responses (we wait for the full completion)

## Key risks

| Risk | Mitigation |
|---|---|
| Hermes 405B rate limits at volume | Job backoff + per-tick cap (5) |
| Hermes JSON parse failures | One retry with stricter system nudge |
| Apify actor changes schema | `normalizeLinkedInProfile` is tolerant of common variants |
| Gmail SMTP greylisting | Job requeues on 4xx; max 3 attempts |
| Phantom leads (no email) | `outreach-send` errors if `lead.email` is null; we leave the message queued and Chetan can fill the email in Studio |

## Exit criteria

- 4+ qualified calls per month booked from automated outreach
- 80%+ of `outreach-generate` calls produce a usable draft on first
  pass (no human edit beyond light copy cleanup)
- `outreach_messages.status = sent / replied / meeting_booked`
  distribution shows a healthy funnel (>= 8% reply rate)

## Plug-and-play delta

After Phase 2, the deploy script:

- Detects missing SMTP creds and offers to use a local MailHog for dev
- Detects missing Apify creds and warns "no leads will be discovered"
- Detects missing Hermes key and tries the public endpoint
- Prints a "next steps" checklist tuned to first-time deploys

## Phase 2 backlog (not blocking exit)

- Add `body_json` slides for carousels rendered server-side as PNG
- Add a webhook receiver for Instantly.ai reply detection
- Add a `replies` table to capture reply text from any source
- Add a `lead_topics` join table for "leads that liked post X"
- Move from `BFS` to `BFS` over Hermes tool-use for richer research
