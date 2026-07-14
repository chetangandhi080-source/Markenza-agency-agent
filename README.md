# Markenza AI

Hermes 3 + Supabase backend for the Markenza two-agent system
(Outreach Agent + Content Agent). No frontend — Supabase Studio is the
dashboard until the React app is built in Phase 2.

## Architecture

```
pg_cron (every 15 min)
  -> orchestrator edge function
      -> drains jobs table (orchestrator-managed queue)
          -> calls sub-agent edge functions (outreach-*, content-*)
              -> Hermes 3 (Nous Research, public endpoint) for AI
              -> Apify for LinkedIn lead scraping
              -> Gmail SMTP for sending email
              -> Postgres for state
```

Single-user auth (Supabase Auth) + RLS scoped to the user's org.

## Layout

```
markenza-ai/
  supabase/
    config.toml
    migrations/
      20260630000000_init.sql   -- schema, RLS, helper trigger
      20260630000100_cron.sql   -- pg_cron schedule
    functions/
      _shared/                  -- CORS, config, supabase REST, hermes,
                                  prompts, apify, smtp, jobs, auth
      outreach-discover/        -- Apify -> leads
      outreach-generate/        -- Hermes -> lead enrichment + draft
      outreach-send/            -- SMTP send + manual LinkedIn tick
      outreach-followup/        -- daily follow-up scanner
      content-research/         -- Hermes -> content_topics
      content-generate/         -- Hermes -> content_posts (pending_approval)
      orchestrator/             -- cron entry point
      auth-bootstrap/           -- create the single user
  scripts/
    deploy.ps1                  -- one-shot deploy (link + push + deploy + secrets)
    create-user.ps1             -- bootstrap the user
    tick.ps1                    -- manual orchestrator tick
    smoke.ps1                   -- end-to-end smoke test
  .env.example
  package.json
```

## One-time setup

```powershell
# 1) Install Supabase CLI
winget install Supabase.CLI

# 2) Create a Supabase project at https://app.supabase.com, copy the project ref.
.\scripts\deploy.ps1 -ProjectRef <your-project-ref>
```

`deploy.ps1` will:

1. Link the local repo to the remote project
2. Apply the SQL migrations
3. Deploy every edge function
4. Push all required secrets to the remote project's secret store

### Bootstrap the user

```powershell
.\scripts\create-user.ps1 -ProjectRef <ref> -Email you@gmail.com -Password <strong-pw>
```

This calls the `auth-bootstrap` function which creates the Supabase auth
user, and the DB trigger `handle_new_user` automatically creates the
default org, profile row, and settings row. Public signups are
disabled in `config.toml`, so only this one user can ever exist.

### Verify

```powershell
.\scripts\smoke.ps1 -ProjectRef <ref> -CronSecret <the-secret-deploy-ps1-printed>
```

You should see JSON responses for orchestrator, content-research, and
outreach-discover. The discover call requires a working Apify token; if
it fails on rate limits, that's fine — the rest of the pipeline still
proves the wiring.

## Daily operations

All agent behavior is driven by the `jobs` table + pg_cron. The
orchestrator wakes every 15 minutes, drains any queued jobs, and
schedules the periodic batches:

- **07:00 UTC** — research 5 fresh content topics
- **08:00 UTC Monday** — research 7 topics for the week
- **10:00 / 16:00 UTC** — follow-up scanner
- **on-demand** — `.\scripts\tick.ps1`

To manually run anything once, insert a row into `jobs` from Supabase
Studio (or call the corresponding function via `Invoke-RestMethod` with
the cron secret as the bearer token).

## Approval gates

- **LinkedIn DMs** are never auto-sent. The agent writes the draft to
  `outreach_messages` with status `draft`. You open Supabase Studio,
  copy the body, send it manually on LinkedIn, then update the row to
  `sent` (or hit `outreach-send` with `action: "linkedin_mark_sent"`).
- **Content posts** are written with status `pending_approval`. You
  open the post, edit if needed, set status to `approved`, post on
  LinkedIn manually, then set `published_at` + `publish_url` when done.
- **Emails** auto-send once queued. Tighten by lowering
  `settings.daily_email_cap` and watching `activity_log`.

## Where to look first

- New leads: `leads`
- Messages waiting on you: `outreach_messages` where `status = 'draft'`
- Posts to approve: `content_posts` where `status = 'pending_approval'`
- Activity timeline: `activity_log`
- Failed jobs: `jobs` where `status = 'failed'`
