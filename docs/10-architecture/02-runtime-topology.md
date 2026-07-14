# 02 — Runtime Topology

> Where each piece runs, how long it runs, and what it depends on.

## Edge functions (Deno on Supabase)

| Function | Cold start | Typical runtime | Concurrency model |
|---|---|---|---|
| `orchestrator` | ~300ms | 1–6s | One at a time per project (no concurrency guard — we handle at the jobs level) |
| `outreach-discover` | ~300ms | 5–30s (Apify wait) | Bounded by max 5 jobs per tick |
| `outreach-generate` | ~300ms | 4–12s (2 Hermes calls) | Up to 5 in parallel from orchestrator |
| `outreach-send` | ~300ms | 1–3s SMTP | Email only — manual path returns instantly |
| `outreach-followup` | ~300ms | 1–2s DB only | Cheap, scan |
| `content-research` | ~300ms | 5–15s | One Hermes call |
| `content-generate` | ~300ms | 5–20s | One Hermes call |
| `auth-bootstrap` | ~300ms | <1s | One-shot, called manually during setup |

All edge functions have a 60s wall clock ceiling. The orchestrator
sub-calls each function with `fetch` and inherits that ceiling per
sub-call, so a single tick can fan out up to 60s × 5 jobs of work.

## Hermes 3 calls

- Endpoint: `https://hermes-agent.nousresearch.com/v1/chat/completions`
- Default model: `hermes-3-llama-3.1-405b`
- Default settings: `temperature=0.4, top_p=0.95, max_tokens=1024`
- JSON mode is enabled by passing `response_format={"type":"json_object"}`
- One retry with stricter instructions on parse failure

Why 405B and not a smaller Hermes?
- We use one Hermes call per lead for analysis, and one for the draft.
- We expect ≤ 5 lead analyses and ≤ 5 drafts per cron tick.
- At $0 (public endpoint) or sub-$0.01/call (when priced), the
  cost-per-lead is well below $0.10 even at 405B pricing.
- 405B is materially better at "no generic B2B fluff" instructions.

## Apify calls

- We use `bebity/linkedin-profile-scraper` by default; any actor with
  the same input/output shape can be swapped via the
  `APIFY_LINKEDIN_ACTOR` env var.
- Apify runs are synchronous (`waitForFinish`) and capped at 90s. If
  Apify takes longer, we abort and requeue the job.
- We do not store Apify results outside `leads.raw_profile`. Apify
  retention is not relied on.

## SMTP

- `smtp.gmail.com:465` over TLS, AUTH LOGIN, using an App Password.
- We do not retry on SMTP 4xx (e.g. greylisting) inside a single edge
  function call — the job goes back to `pending` and the orchestrator
  picks it up on the next tick.
- TLS connection close on `QUIT` to avoid leaking sockets.

## Postgres

- Supabase Pro plan minimum (for pg_cron + net extension).
- All write paths go through the service role inside edge functions
  (bypasses RLS for the agent, RLS for any direct Studio access).
- All read paths from Studio respect RLS.

## pg_cron

- One schedule: `*/15 * * * *` invoking `orchestrator` with the
  `CRON_SECRET` bearer.
- The orchestrator itself decides what to do based on UTC hour-of-day
  (so it works regardless of where Chetan is).
- Schedule is set in `supabase/migrations/20260630000100_cron.sql`
  and re-runnable (unschedules first).
