# Markenza AI — operations runbook

## Daily (5 min)

1. Open Supabase Studio > Table Editor > `outreach_messages`
   - Filter `status = draft AND channel = linkedin_dm`
   - Copy body, send manually on LinkedIn, then run:
     ```powershell
     # mark one as sent (using the studio SQL editor is fine too)
     update outreach_messages
       set status = 'sent', sent_at = now()
       where id = '<message_id>';
     ```
     (or hit `outreach-send` with `action: "linkedin_mark_sent"`)
2. `content_posts` where `status = pending_approval` — review, edit,
   set to `approved`, post on LinkedIn, set `published_at` + `publish_url`.
3. `activity_log` last 24h — glance for `failed` jobs and bounced emails.

## Weekly (20 min)

- Review `leads.score` distribution and `leads.status` breakdown. Adjust
  `settings.icp_personas` and the search URLs you pass to
  `outreach-discover` if scoring skews low.
- Look at `outreach_messages.body` from sent emails — kill any that read
  generic. Update `SYSTEM_PERSONA` or the per-step guidance in
  `supabase/functions/_shared/prompts.ts` and redeploy:
  ```powershell
  supabase functions deploy outreach-generate --project-ref <ref>
  ```
- Approve any leftover `idea` topics or mark them `archived`.

## When something breaks

- `jobs` where `status = failed`:
  - Read the `error` column
  - Common ones:
    - `Hermes 5xx` — public endpoint rate limit, raise `max_attempts` or
      reduce daily volume
    - `SMTP 535` — wrong app password; rotate in `supabase secrets set`
    - `Apify start failed 401` — bad `APIFY_TOKEN`
- `outreach_messages` stuck in `queued` for hours — orchestrator isn't
  ticking. Check `cron.job` and the `markenza_orchestrator_every_15m`
  schedule; check the `app.settings.edge_base_url` and
  `app.settings.cron_secret` were set on the DB.

## Rotating secrets

```powershell
supabase secrets set --project-ref <ref> SMTP_PASS="<new>"
# restart not required; new invocation picks them up
```

For `CRON_SECRET` you must also update the `app.settings.cron_secret`
in the Postgres database:
```sql
alter database postgres set app.settings.cron_secret = '<new>';
```
then reschedule (re-run migration `20260630000100_cron.sql`).

## Adding a new agent

1. `supabase/functions/<new-agent>/index.ts` — drop in.
2. Add an entry to the `map` in `orchestrator/index.ts`.
3. `supabase functions deploy <new-agent> --project-ref <ref>`
4. (Optional) Schedule it from the orchestrator tick body.

## Adding a new prompt

Edit `supabase/functions/_shared/prompts.ts`, then redeploy the
functions that use it. The orchestrator's only use of the prompts is
indirect (through sub-agents), so you can iterate per-agent.

## Frontend (later, Phase 2)

The schema is intentionally flat + RLS-scoped so a React app can talk
to the same REST endpoints with the user's anon JWT. The current edge
functions are HTTP/JSON only — no streaming, no file uploads. When you
build the frontend, you'll mostly want to query the tables directly
from the browser with RLS doing the auth work, and only call the edge
functions for state transitions (send, tick, approve).
