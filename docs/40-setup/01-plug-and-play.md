# Plug-and-Play Setup

> Ship the system in 10 minutes. The whole thing.

## 0. Prerequisites (once)

```powershell
# Install Supabase CLI
winget install Supabase.CLI

# Install git (if not already)
winget install Git.Git

# Make sure you have a Supabase project
# -> https://app.supabase.com → New project → copy the project ref
# It looks like "abcdefghij"
```

## 1. Clone

```powershell
git clone https://github.com/chetangandhi080-source/Markenza-agency-agent.git
cd Markenza-agency-agent/markenza-ai
```

## 2. Configure (one time)

Copy the env template and fill in the values you have:

```powershell
copy .env.example .env
notepad .env
```

You''ll need:

| Var | Where to get it |
|---|---|
| `APIFY_TOKEN` | https://console.apify.com → Integrations → Token |
| `SMTP_USER` | Your Gmail address |
| `SMTP_PASS` | https://myaccount.google.com/apppasswords (16 chars) |
| `SMTP_FROM` | `"Markenza <hi@yourdomain.com>"` (or your Gmail until you set up Workspace) |
| `HERMES_API_KEY` | Leave blank to use the public endpoint; or paste a Together AI key |

Everything else has sane defaults in `.env.example`.

## 3. Deploy

```powershell
.\scripts\deploy.ps1 -ProjectRef <paste-your-ref-here>
```

This single command will:

1. Link the repo to your Supabase project
2. Apply all SQL migrations (schema + pg_cron)
3. Deploy all 8 edge functions
4. Push every secret to your project
5. Print the generated `CRON_SECRET` (save it!)

## 4. Bootstrap the user

```powershell
.\scripts\create-user.ps1 `
  -ProjectRef <ref> `
  -Email you@gmail.com `
  -Password <a-strong-one>
```

This creates the Supabase auth user, and a DB trigger automatically
attaches the default org + profile + settings.

## 5. Verify

```powershell
.\scripts\smoke.ps1 -ProjectRef <ref> -CronSecret <from-step-3>
```

You should see three 200 responses: orchestrator, content-research,
outreach-discover.

If `outreach-discover` errors with `Apify 401`, your `APIFY_TOKEN` is
wrong. Fix it: `supabase secrets set APIFY_TOKEN=<correct> --project-ref <ref>`
and re-run the smoke test.

## 6. First run

Open Supabase Studio: https://app.supabase.com/project/<ref>

In the SQL editor, run:

```sql
-- 1. Set your offer summary (used by Hermes in every prompt)
update settings
set offer_summary = 'You run a one-person AI automation + Google Ads + performance marketing agency. You help e-commerce, coaches, and local businesses get more leads from their existing traffic. Packages $500–$1,500/mo.'
where org_id = (select id from orgs limit 1);

-- 2. Trigger your first content research
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/content-research',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer <cron-secret>'
  ),
  body := jsonb_build_object('count', 5)
);
```

Then watch `content_topics` populate in the Table Editor.

## 7. Daily use

- **New leads:** paste LinkedIn search URLs into a job:
  ```powershell
  curl -X POST `
    "https://<ref>.supabase.co/functions/v1/outreach-discover" `
    -H "Authorization: Bearer <cron-secret>" `
    -H "Content-Type: application/json" `
    -d '{\"searchUrls\":[\"https://www.linkedin.com/search/results/people/?keywords=ecommerce+founder\"]}'
  ```
- **Approve LinkedIn DMs:** Studio → outreach_messages → filter
  `status = draft AND channel = linkedin_dm` → copy body → send →
  mark sent.
- **Approve content posts:** Studio → content_posts → filter
  `status = pending_approval` → read → edit → set `approved` → post
  on LinkedIn → set `published_at` + `publish_url`.
- **Force a tick (skip the 15-min wait):**
  ```powershell
  .\scripts\tick.ps1 -ProjectRef <ref> -CronSecret <secret>
  ```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `cron.schedule` errors with "extension not found" | Run `create extension if not exists pg_cron;` in the SQL editor |
| `Orchestrator 401` | Wrong `CRON_SECRET`; re-run `deploy.ps1` to regenerate |
| `Hermes 404` | Public endpoint URL changed; set `HERMES_BASE_URL` to your Together AI endpoint |
| SMTP 535 | Wrong App Password; regenerate at myaccount.google.com/apppasswords |
| Studio shows 0 orgs | The bootstrap didn''t run; call `auth-bootstrap` again |
| Jobs stuck in `pending` | The cron isn''t ticking; check `select * from cron.job;` in SQL editor |
