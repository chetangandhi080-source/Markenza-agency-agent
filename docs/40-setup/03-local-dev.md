# Local development

> Run the whole stack on your laptop with no cloud dependencies.

## Prereqs

```powershell
winget install Supabase.CLI Docker.DockerDesktop
# Restart, then:
supabase start
```

`supabase start` spins up:
- Postgres on `localhost:54322`
- Studio on `http://localhost:54323`
- Inbucket (email testing) on `localhost:54324`
- Edge Functions runtime on `localhost:54321`
- Realtime on `localhost:54325`
- Storage API on `localhost:54321/storage/v1`

First start downloads Docker images and takes ~3 minutes. Subsequent
starts are seconds.

## Migrations

```powershell
# Reset to a clean state (drops + recreates DB, then re-applies migrations)
supabase db reset

# Apply pending migrations without reset
supabase db push
```

## Edge functions

```powershell
# Run all functions, with env from .env
supabase functions serve --env-file .env

# Run a single function
supabase functions serve outreach-generate --env-file .env
```

In another shell:

```powershell
$CRON = (Get-Content .env | Select-String "CRON_SECRET").ToString().Split("=")[1]
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:54321/functions/v1/orchestrator" `
  -Headers @{ Authorization = "Bearer $CRON" } `
  -Body "{}"
```

## Mocking external services

If you don''t have Apify / Gmail / Hermes creds handy:

- `HERMES_API_KEY=mock` and `HERMES_BASE_URL=http://localhost:9999`
  — the function will fail, but you can see the request shape
- Leave `APIFY_TOKEN=` empty — `outreach-discover` will throw early
  with a clear "missing env var" message
- Leave `SMTP_PASS=` empty — `outreach-send` will throw early

For a full offline mock, set:

```env
HERMES_BASE_URL=mock://
```

and add this to `_shared/hermes.ts` (PR template included):

```ts
if (this.cfg.hermesBaseUrl === "mock://") {
  return { content: JSON.stringify({ fit_score: 75, ...stub }),
           raw: {}, usage: {} };
}
```

## Connecting the local DB to your editor

The local Postgres connection string is printed by `supabase start`.
For VS Code / DataGrip / TablePlus:

```
host:     localhost
port:     54322
user:     postgres
password: postgres
database: postgres
```

## Database branching (Supabase feature)

`supabase db branch create <name>` makes a fresh DB for PR review.
The migration files apply automatically. Useful for testing a
migration before pushing to prod:

```powershell
supabase db branch create test-cooldown
supabase db branch list
supabase db branch delete test-cooldown
```

## Studio

http://localhost:54323 — same UI as production, talks to your local
Postgres. You can edit data, run SQL, browse tables, all locally.

## End-to-end smoke

```powershell
# After `supabase start` and `supabase functions serve --env-file .env`
.\scripts\smoke.ps1 -ProjectRef localhost
# (the script needs a small tweak to handle localhost; PR welcome)
```

For now, hit each function manually with `Invoke-RestMethod` as shown
above.
