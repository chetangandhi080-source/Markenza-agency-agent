# Phase 0 — Local bring-up

> Goal: prove the system boots on a developer machine with zero
> cloud dependencies. No external API calls. No real data.

## Tasks

- [x] Init Supabase locally with `supabase init`
- [x] Write all 8 edge functions
- [x] Write 2 migrations (schema + cron stub)
- [x] Write deploy + smoke scripts
- [x] Write `config.toml` with `verify_jwt = false` (we auth ourselves)

## Verification

```powershell
# from repo root
supabase start
# in another shell
supabase functions serve --env-file .env
# in a third shell
curl http://localhost:54321/functions/v1/orchestrator `
  -H "Authorization: Bearer $CRON_SECRET" `
  -H "Content-Type: application/json" `
  -d '{"source":"smoke"}'
```

Expected: `{ "ok": true, "actions": [...] }`.

## What is intentionally NOT in Phase 0

- Real Hermes calls (mocked by returning a stub JSON if `HERMES_BASE_URL`
  starts with `mock://`)
- Real Apify calls (skipped if `APIFY_TOKEN` is empty)
- Real SMTP (skipped if `SMTP_PASS` is empty)
- The actual pg_cron schedule (only installed on remote)

## Exit criteria

- `supabase functions serve` boots all 8 functions
- `smoke.ps1` returns 200 for orchestrator + content-research
- All migrations apply cleanly with `supabase db reset`
