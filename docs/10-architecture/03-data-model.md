# 03 — Data Model

> Every table, every status, every index. Read this before writing
> a new query — the indexes are load-bearing for the orchestrator.

## Tables

### `orgs`
Multi-tenant anchor. v1 always has exactly one row.
- `id uuid pk`
- `name text`
- `created_at timestamptz`

### `profiles`
1:1 with `auth.users`. Carries the org pointer.
- `id uuid pk references auth.users`
- `org_id uuid fk -> orgs`
- `full_name text`, `email text`

### `leads`
A discovered prospect. **Append-mostly**; state changes via
`status` updates.
- `id uuid pk`
- `org_id uuid fk`
- `source text` — one of `apify_linkedin`, `apify_gmaps`, `manual`, `import`
- `external_id text` — Apify profileId / place_id
- `full_name text`, `headline text`, `company text`, `company_domain text`
- `title text`, `location text`, `industry text`
- `linkedin_url text unique`, `email text`, `phone text`
- `raw_profile jsonb` — full Apify payload (debug)
- `enrichment jsonb` — Hermes analysis output
- `embedding vector(1536)` — reserved for future similarity search
- `status text` — see below
- `score smallint` — 0..100 fit score
- `last_touched_at timestamptz`
- `cooldown_until timestamptz`
- `created_at`, `updated_at`

**Lead status state machine**
```
new
  → analyzing        (set by outreach-generate entry)
  → qualified        (analysis done, fit >= 30)
  → message_ready    (draft created)
  → contacted        (email sent OR linkedin marked sent)
  → replied          (manual)
  → meeting_booked   (manual)
  → closed_won       (manual)
  → closed_lost      (manual or low score)
  → do_not_contact   (manual)

terminal: closed_won, closed_lost, do_not_contact
```

### `outreach_sequences`
Reusable sequence templates. v1 has a small set seeded by deploy
script.
- `id uuid pk`
- `org_id uuid fk`
- `name text`
- `channel text` — `email` or `linkedin_dm`
- `steps jsonb` — `[{step:1, delay_days:0}, ...]`
- `active boolean`

### `outreach_messages`
The actual message records. The agent writes these; Chetan reads them
in Studio.
- `id uuid pk`
- `org_id uuid fk`, `lead_id uuid fk`
- `sequence_id uuid fk?`
- `channel text` — `email` or `linkedin_dm`
- `step_number smallint` — 1, 2, or 3
- `subject text` (email only)
- `body text`
- `status text` — see below
- `scheduled_for timestamptz?` (set on draft for visibility)
- `sent_at timestamptz?`
- `provider_msg_id text?` (SMTP message-id)
- `error text?`

**Message status state machine**
```
draft                  (linkedin, before human sends)
  → approved           (Studio edit; same row)
queued                 (email, ready to send)
  → sent | failed
sent
  → delivered (optional, only if we add webhook)
  → replied (manual)
  → bounced (manual)
```

### `content_topics`
Idea bank. Hermes generates them; Chetan picks which to draft.
- `id uuid pk`
- `org_id uuid fk`
- `pillar text` — one of the 5 pillar names
- `title text`, `hook text`
- `outline jsonb` — `["line 1", "line 2", ...]`
- `source_refs jsonb`
- `status text` — `idea` → `researched` → `drafting` → `ready` → `used` → `archived`
- `score smallint`
- `created_at`

### `content_posts`
Drafted posts. The `status` column is the editorial workflow.
- `id uuid pk`
- `org_id uuid fk`, `topic_id uuid fk?`
- `format text` — `text` | `carousel` | `thread`
- `body_markdown text`
- `body_json jsonb` — slides array for carousels, thread array for threads
- `scheduled_for date?`
- `status text` — `draft` → `pending_approval` → `approved` → `published` (or `rejected`)
- `published_at timestamptz?`
- `publish_url text?` — set after manual publish

### `jobs`
The orchestrator''s work queue. Job kinds are enumerated in code.
- `id uuid pk`
- `org_id uuid fk`
- `kind text` — `outreach.discover | outreach.generate | outreach.send | outreach.followup | content.research | content.generate | orchestrator.tick`
- `payload jsonb`
- `status text` — `pending | running | succeeded | failed | cancelled`
- `attempts smallint`, `max_attempts smallint`
- `run_after timestamptz`
- `started_at`, `finished_at`
- `result jsonb`, `error text`

**Index on `(status, run_after) WHERE status = ''pending''` is the
hot path** — every orchestrator tick hits it.

### `activity_log`
Append-only audit trail.
- `id uuid pk`
- `org_id uuid fk`
- `actor text` — `user | outreach_agent | content_agent | orchestrator | system`
- `action text` — dotted verb, e.g. `leads.discovered`
- `entity_type text?`, `entity_id uuid?`
- `details jsonb`
- `created_at`

### `settings`
One row per org. Hot-reloadable by reading on every agent call.
- `org_id uuid pk fk -> orgs`
- `hermes_base_url text`
- `hermes_model text`
- `hermes_api_key text?` (optional; public endpoint is keyless)
- `daily_email_cap smallint` (default 40)
- `daily_linkedin_cap smallint` (default 25)
- `icp_personas jsonb` — array of `{name, title_pattern, industry, ...}`
- `offer_summary text`
- `updated_at`

## Indexes worth knowing

| Index | Used by |
|---|---|
| `leads(org_id, status)` | Follow-up scanner, dashboard filters |
| `leads(org_id, score desc)` | "Top of pipeline" view |
| `leads(org_id, created_at desc)` | Discover view, dedupe |
| `leads(linkedin_url) unique` | Dedupe in outreach-discover |
| `outreach_messages(org_id, status, scheduled_for)` | All send-side queries |
| `outreach_messages(lead_id, step_number)` | Per-lead history |
| `jobs(status, run_after) where status = ''pending''` | Orchestrator tick hot path |
| `activity_log(org_id, created_at desc)` | Dashboard timeline |

## Multi-tenant readiness

Every business table has `org_id` + RLS scoped to `current_org_id()`.
To go multi-tenant later:
1. Add a `sign_up` flow that creates a new org per signup.
2. Drop the `handle_new_user` trigger''s "first org wins" logic.
3. Add a per-org `daily_email_cap` and SMTP credentials (move out of
   env into per-org secrets table — see `50-runbook/03-future-work.md`).
