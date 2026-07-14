# Research — Supabase (the platform)

> Why Supabase for this build, and the specific Supabase features we
> lean on.

## Why Supabase

- **Postgres-first.** No ORM impedance. RLS is real SQL policies, not
  middleware.
- **Edge Functions (Deno).** Same code runs locally and in production
  with `supabase functions serve` and `supabase functions deploy`.
- **pg_cron + net extension.** Cron-driven background jobs without
  spinning up a separate worker.
- **Auth + Studio + Storage in one.** Single dashboard for everything
  except the React app.
- **Pricing.** Pro plan ($25/mo) covers everything v1 needs.

## What we actually use

| Feature | Where | Why |
|---|---|---|
| Postgres | everywhere | durable state |
| `pgcrypto` | migrations | `gen_random_uuid()` for PKs |
| `pg_cron` | migrations | schedule the orchestrator |
| `net` extension | migrations | `net.http_post` from cron |
| `vector` (pgvector) | schema | reserved for Phase 3 RAG |
| Edge Functions | `supabase/functions/` | all AI + side effects |
| Auth | `auth.users` | single-user login |
| Studio | end-user UI | manual approval gates |
| Secrets | `supabase secrets` | API keys (never in code) |
| RLS | every table | defense in depth |

## What we deliberately do NOT use

- **Realtime** — v1 doesn''t need it; Phase 4 adds it
- **Storage** — no file uploads
- **Edge Functions for everything** — we keep compute close to the
  data; no separate worker service
- **Supabase Vector** as the only retrieval — pgvector is fine

## Postgres-specific tricks we rely on

### 1. Partial index for the hot path

```sql
create index jobs_ready_idx on jobs (status, run_after)
  where status = ''pending'';
```

This is the index every orchestrator tick hits. The `where` clause
makes it ~10× smaller than an unfiltered index and faster to scan.

### 2. RLS via helper function

```sql
create function current_org_id() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select org_id from profiles where id = auth.uid()
$$;
```

Every policy reads `org_id = public.current_org_id()`. The function
is `STABLE SECURITY DEFINER` so it runs once per query, with the
caller''s permissions, and can''t be subverted by a malicious table
subquery.

### 3. `auth.users` → app tables via trigger

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

This is how creating a Supabase auth user automatically gets you a
`profiles` row, an `orgs` row, and a `settings` row. One call, three
tables populated.

### 4. Updated-at trigger

```sql
create function set_updated_at() returns trigger ...
```

Cheap, but means we never forget to bump `updated_at` when writing
the column.

## Edge Function gotchas

| Gotcha | How we handle it |
|---|---|
| No npm-style `node_modules` | Use Deno''s `import` from URLs; keep `deno.json` for relative aliases |
| `verify_jwt = true` is the default | Set `verify_jwt = false` in `config.toml`; we auth ourselves with `CRON_SECRET` or user JWT |
| 60s wall clock per invocation | All work is bounded; sub-calls inherit the cap |
| No streaming | All Hermes calls are `stream: false` |
| `Deno.env.get` for secrets | Centralized in `_shared/config.ts` |
| Cold starts are ~300ms | Acceptable; we don''t optimize |

## Local dev workflow

```powershell
# 1. First time
supabase init
supabase start

# 2. Apply migrations
supabase db reset

# 3. Run a function locally
supabase functions serve --env-file .env
# then:
curl http://localhost:54321/functions/v1/orchestrator `
  -H "Authorization: Bearer $CRON_SECRET" `
  -d "{}"

# 4. Watch DB
# Studio runs at http://localhost:54323
```

## Migration discipline

- Filenames: `YYYYMMDDHHMMSS_name.sql`
- Always `create … if not exists`
- Never `drop` in a committed migration (use a follow-up migration)
- Test with `supabase db reset` locally before pushing
- `supabase db push` is the prod-applier; re-runs are safe

## When NOT to use Supabase

- If you need > 60s jobs — split them or use a separate worker
- If you need > 500 concurrent connections — Pro plan supports it,
  but you''ll want PgBouncer in front
- If you need a self-hosted Postgres in the same data center as a
  legacy system — Supabase Cloud only at this point
