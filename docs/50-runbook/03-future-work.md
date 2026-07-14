# Future work

> Backlog, prioritized. Items here have a phase number from
> `20-phases/`.

## Phase 2 backlog

- [ ] `replies` table + manual reply logging form
- [ ] `lead_topics` join table (which leads engaged with which posts)
- [ ] Carousel slide rendering (server-side PNG via canvas)
- [ ] Per-org sending window (e.g. only email between 9am–5pm in lead''s TZ)
- [ ] Per-channel sequence templates (currently hardcoded in prompts)
- [ ] Negative reply detection (unsubscribe → `do_not_contact`)
- [ ] Outreach experiment A/B framework (Phase 3 prerequisite)

## Phase 3 backlog

- [ ] `outreach-classify` edge function (8B model)
- [ ] Two-tier routing in `outreach-generate`
- [ ] `outreach_experiments` table + variant assignment
- [ ] IMAP reply polling + webhook ingestion
- [ ] Hermes-based reply classification
- [ ] RAG over past winning emails (pgvector)
- [ ] Cost dashboard: $ per booked call, by week

## Phase 4 backlog

- [ ] Next.js 14 app
- [ ] Supabase Auth UI
- [ ] Dashboard view (numbers, recent activity, Realtime)
- [ ] Leads table with filter + bulk actions
- [ ] Outreach kanban (drag status changes)
- [ ] Content calendar view
- [ ] Settings page
- [ ] Buffer integration (LinkedIn + Twitter autopublish)
- [ ] Taplio integration (carousel autopublish)
- [ ] Calendly webhook → `meeting_booked`

## Phase 5 backlog

- [ ] Per-org secrets in `settings` (pgcrypto for SMTP_PASS, APIFY_TOKEN)
- [ ] `loadOrgConfig(orgId)` helper, deprecate `loadConfig()` in edge fns
- [ ] Signup + onboarding wizard
- [ ] Stripe Checkout + webhook
- [ ] Usage caps enforced in orchestrator
- [ ] White-label branding (brand_name, brand_color, logo_url)
- [ ] Admin panel (orgs, subscriptions, abuse signals)

## Tech debt

- [ ] The job claim is not transactional. Two concurrent orchestrators
      could both see "pending" and both try to claim. The optimistic
      `WHERE status = ''pending''` check covers 99% of cases; add a
      Postgres `SELECT … FOR UPDATE SKIP LOCKED` RPC for the last 1%.
- [ ] The orchestrator is one function that does scheduling + draining.
      Splitting them makes each easier to test. Low priority.
- [ ] The `enrichment` column on `leads` is `jsonb` and unstructured.
      When the schema is stable, extract a typed `lead_analyses` table.
- [ ] No unit tests. The next agent to add should come with one test
      per prompt.

## Ideas (not yet prioritized)

- **Voice notes as LinkedIn DMs** — record once, personalize per lead
  via ElevenLabs. Higher reply rates, much higher cost.
- **Auto-DM engaged LinkedIn commenters** — finds people who
  commented on your posts, sends a follow-up. Risky if overdone.
- **Slack alerts on hot leads** — `meeting_booked` triggers a Slack
  message so you see it within seconds.
- **Calendar integration** — pull lead''s domain → check if they have
  a public calendar → suggest meeting times that don''t overlap.
- **Lead enrichment waterfall** — Apify first, Apollo second,
  Clearbit third. Stop at first hit. Phase 5 feature.
- **Multi-language outreach** — detect lead''s likely language from
  profile, write the message in that language. Hermes 3 supports
  Hindi natively if Chetan''s market shifts.
- **AI-generated case studies** — take a closed_won lead, ask
  Hermes to draft a public-facing case study (with permission).

## What to never build

- **A custom CRM UI on top of this.** Use Attio, Folk, or Notion.
  Building CRM UI is a tarpit.
- **A/B testing platform.** Use PostHog or GrowthBook.
- **A scheduler UI.** Cron expressions in `cron.sql` are fine; a
  drag-and-drop scheduler would be a week of work for ~0 value.
- **A chatbot for the Markenza website.** Off-topic for this system.
