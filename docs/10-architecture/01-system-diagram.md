# 01 — System Diagram

> The whole thing on one page.

```
                       ┌──────────────────────────────────────┐
                       │           pg_cron (every 15m)        │
                       │             Supabase Postgres        │
                       └────────────────┬─────────────────────┘
                                        │ net.http_post
                                        │ (CRON_SECRET bearer)
                                        ▼
                       ┌──────────────────────────────────────┐
                       │       orchestrator (edge fn)         │
                       │  - drain jobs table (up to 5/tick)   │
                       │  - schedule periodic jobs            │
                       └────────────────┬─────────────────────┘
                                        │ POST
                ┌───────────────────────┼───────────────────────┐
                │                       │                       │
                ▼                       ▼                       ▼
        ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
        │ outreach-     │       │ outreach-     │       │ content-      │
        │ discover      │       │ generate      │       │ research      │
        │  (Apify)      │       │  (Hermes 3)   │       │  (Hermes 3)   │
        └───────┬───────┘       └───────┬───────┘       └───────┬───────┘
                │                       │                       │
                │ insert leads          │ insert messages       │ insert topics
                │ enqueue generate      │ enqueue send          │ enqueue generate
                ▼                       ▼                       ▼
        ┌──────────────────────────────────────────────────────────────┐
        │                  Supabase Postgres (RLS-scoped)              │
        │  orgs · profiles · leads · outreach_messages · content_* ·   │
        │  jobs · activity_log · settings                              │
        └──────────────────────────────────────────────────────────────┘
                ▲                       ▲                       ▲
                │ read (Studio)         │ read (Studio)         │ read (Studio)
                │                       │                       │
                │   ┌───────────────────────────────────────────┐   │
                │   │         Supabase Studio (dashboard)      │   │
                │   └───────────────────────────────────────────┘   │
                │                       │                       │
                │   human approval      │  manual send on       │
                │   on posts            │  LinkedIn, then       │
                │                       │  mark "sent" in       │
                │                       │  outreach_messages    │
                │                       ▼                       │
                │              ┌───────────────┐               │
                └──────────────│ outreach-send │───────────────┘
                               │  (Gmail SMTP) │
                               └───────────────┘
```

## What crosses a trust boundary

- **Hermes 3 endpoint** is over the public internet. We send the prompt
  + lead profile; we do NOT send raw_resume or any PII beyond what is
  already in `leads`.
- **Apify endpoint** is over the public internet. We send the search
  URL only. We do not send credentials to Apify per request — they are
  stored as a Supabase secret.
- **Gmail SMTP** is over TLS port 465 using an App Password (never the
  real Gmail password). TLS is non-negotiable.
- **Supabase service role key** never leaves the edge function. It is
  the only thing that bypasses RLS.

## What does NOT exist in v1

- No websocket connections
- No file storage beyond the edge function source
- No outbound HTTP except the four named destinations
- No long-running background workers — everything is request/response
