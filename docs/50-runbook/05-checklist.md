# Markenza AI — Pre-ship checklist

> Run through this before you declare Phase 2 done.

## Infra

- [ ] Supabase project created (Pro plan for pg_cron + net extension)
- [ ] `scripts/deploy.ps1` runs end to end with no errors
- [ ] `CRON_SECRET` saved somewhere safe (password manager)
- [ ] `pg_cron` schedule visible: `select * from cron.job;`
- [ ] `select version();` returns Postgres 15+
- [ ] `select * from settings;` returns one row with `offer_summary` set

## Auth

- [ ] `scripts/create-user.ps1` ran successfully
- [ ] `select * from profiles;` returns one row
- [ ] `select * from orgs;` returns one row
- [ ] Supabase Studio login works with that user
- [ ] Studio shows tables: orgs, profiles, leads, outreach_messages,
      content_topics, content_posts, jobs, activity_log, settings

## External services

- [ ] `APIFY_TOKEN` set in `supabase secrets`
- [ ] `smoke.ps1` Apify call returns at least 0 (not an error)
- [ ] Gmail App Password set in `SMTP_PASS`
- [ ] Manual test email sends: see Inbox at the `SMTP_FROM` address
- [ ] `HERMES_BASE_URL` reachable: `curl https://hermes-agent.nousresearch.com/v1/models`
      returns a list including `hermes-3-llama-3.1-405b`
- [ ] (Optional) `HERMES_API_KEY` set if using a paid endpoint

## First end-to-end run

- [ ] Pasted a LinkedIn search URL into `outreach-discover`
- [ ] Saw rows appear in `leads`
- [ ] Saw `outreach.generate` jobs in `jobs`
- [ ] After orchestrator tick, saw rows in `outreach_messages`
- [ ] Email message: status went `queued` → `sent`
- [ ] LinkedIn message: status stayed `draft`
- [ ] `leads.status` went `new` → `qualified` → `message_ready` → `contacted`
- [ ] Saw `activity_log` rows for each step

## First content run

- [ ] Triggered `content-research` (manual or wait for 07:00 UTC)
- [ ] Saw rows in `content_topics`
- [ ] Picked one, called `content-generate`
- [ ] Saw a row in `content_posts` with `status = pending_approval`
- [ ] Approved it, posted on LinkedIn, set `publish_url`
- [ ] Saw the corresponding `content_topics` row go to `status = used`

## Documentation

- [ ] `README.md` is accurate (paths, commands, env var names)
- [ ] `docs/40-setup/01-plug-and-play.md` steps actually work for a
      fresh Supabase project
- [ ] `.env.example` matches what `config.ts` reads
- [ ] `docs/50-runbook/01-daily-ops.md` covers everything the user
      will do each day

## Monitoring

- [ ] Set up Supabase log drain (Settings → Logs → Export)
- [ ] Bookmark the daily ops SQL queries
- [ ] Decide where weekly backups go (Google Drive, S3, local)
- [ ] Calendar reminder for Friday weekly review

## If everything is checked

You are production-ready. Hand the daily ops doc to yourself (or a
future VA), stop touching the code, and start measuring what works.
The first week''s data will tell you more about what to build next
than any amount of planning.
