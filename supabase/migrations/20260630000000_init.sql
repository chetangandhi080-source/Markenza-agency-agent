-- =====================================================================
-- Markenza AI — initial schema (v4 PRD)
-- Single-user, multi-tenant-ready. Hermes 3 driven agents.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";
create extension if not exists "vector";

-- ---------------------------------------------------------------------
-- Orgs (multi-tenant ready; v1 has exactly one)
-- ---------------------------------------------------------------------
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Profiles — mirrors auth.users 1:1 for the single user
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references public.orgs(id) on delete restrict,
  full_name   text,
  email       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Leads — discovered from Apify, enriched by Hermes
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id) on delete cascade,
  source             text not null check (source in ('apify_linkedin','apify_gmaps','manual','import')),
  external_id        text,                             -- Apify profileId / place_id
  full_name          text,
  headline           text,
  company            text,
  company_domain     text,
  title              text,
  location           text,
  industry           text,
  linkedin_url       text unique,
  email              text,
  phone              text,
  raw_profile        jsonb not null default '{}'::jsonb,
  enrichment         jsonb not null default '{}'::jsonb, -- Hermes analysis output
  embedding          vector(1536),                     -- for similarity search later
  status             text not null default 'new'
                     check (status in ('new','analyzing','qualified','message_ready',
                                       'contacted','replied','meeting_booked',
                                       'closed_won','closed_lost','do_not_contact')),
  score              smallint check (score between 0 and 100),
  last_touched_at    timestamptz,
  cooldown_until     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists leads_org_status_idx     on public.leads (org_id, status);
create index if not exists leads_org_score_idx      on public.leads (org_id, score desc);
create index if not exists leads_org_created_idx    on public.leads (org_id, created_at desc);
create index if not exists leads_external_idx       on public.leads (external_id);

-- ---------------------------------------------------------------------
-- Outreach sequences (templates + per-lead step state)
-- ---------------------------------------------------------------------
create table if not exists public.outreach_sequences (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  channel     text not null check (channel in ('email','linkedin_dm')),
  steps       jsonb not null,           -- [{step:1, delay_days:0, subject:'...', template_id:'...'}, ...]
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.outreach_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  sequence_id     uuid references public.outreach_sequences(id) on delete set null,
  channel         text not null check (channel in ('email','linkedin_dm')),
  step_number     smallint not null default 1,
  subject         text,
  body            text not null,
  status          text not null default 'draft'
                  check (status in ('draft','queued','approved','sent','delivered',
                                    'replied','bounced','failed','skipped')),
  scheduled_for   timestamptz,
  sent_at         timestamptz,
  provider_msg_id text,                 -- SMTP message-id, etc.
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists outreach_msgs_org_status_idx on public.outreach_messages (org_id, status, scheduled_for);
create index if not exists outreach_msgs_lead_idx       on public.outreach_messages (lead_id, step_number);

-- ---------------------------------------------------------------------
-- Content calendar + posts
-- ---------------------------------------------------------------------
create table if not exists public.content_topics (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  pillar      text,                     -- e.g. 'AI Automation','Google Ads Wins','Case Studies'
  title       text not null,
  hook        text,
  outline     jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb, -- research notes
  status      text not null default 'idea'
              check (status in ('idea','researched','drafting','ready','used','archived')),
  score       smallint,
  created_at  timestamptz not null default now()
);
create index if not exists content_topics_org_status_idx on public.content_topics (org_id, status, created_at desc);

create table if not exists public.content_posts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  topic_id       uuid references public.content_topics(id) on delete set null,
  format         text not null check (format in ('text','carousel','thread','article')),
  body_markdown  text not null,
  body_json      jsonb not null default '{}'::jsonb, -- structured slide data for carousels
  scheduled_for  date,
  status         text not null default 'draft'
                 check (status in ('draft','pending_approval','approved','published','rejected')),
  published_at   timestamptz,
  publish_url    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists content_posts_org_status_idx on public.content_posts (org_id, status, scheduled_for);

-- ---------------------------------------------------------------------
-- Job queue — drives cron-orchestrated agents
-- ---------------------------------------------------------------------
create table if not exists public.jobs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  kind          text not null,          -- 'outreach.discover','outreach.generate','outreach.send','outreach.followup','content.research','content.generate','orchestrator.tick'
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'pending'
                check (status in ('pending','running','succeeded','failed','cancelled')),
  attempts      smallint not null default 0,
  max_attempts  smallint not null default 3,
  run_after     timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  result        jsonb,
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists jobs_ready_idx on public.jobs (status, run_after) where status = 'pending';

-- ---------------------------------------------------------------------
-- Activity log — append-only audit trail for the dashboard
-- ---------------------------------------------------------------------
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  actor       text not null check (actor in ('user','outreach_agent','content_agent','orchestrator','system')),
  action      text not null,
  entity_type text,                     -- 'lead','message','post','job'
  entity_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists activity_org_created_idx on public.activity_log (org_id, created_at desc);

-- ---------------------------------------------------------------------
-- Settings — org-level config (Hermes model, sending limits, etc.)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  org_id            uuid primary key references public.orgs(id) on delete cascade,
  hermes_base_url   text not null default 'https://hermes-agent.nousresearch.com',
  hermes_model      text not null default 'hermes-3-llama-3.1-405b',
  hermes_api_key    text,               -- optional; Nous public endpoint may be keyless
  daily_email_cap   smallint not null default 40,
  daily_linkedin_cap smallint not null default 25,
  icp_personas      jsonb not null default '[]'::jsonb,
  offer_summary     text,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'leads_set_updated_at') then
    create trigger leads_set_updated_at before update on public.leads
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'msgs_set_updated_at') then
    create trigger msgs_set_updated_at before update on public.outreach_messages
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'posts_set_updated_at') then
    create trigger posts_set_updated_at before update on public.content_posts
      for each row execute function public.set_updated_at();
  end if;
end$$;

-- ---------------------------------------------------------------------
-- Row Level Security — single user, scoped by auth.uid()
-- ---------------------------------------------------------------------
alter table public.orgs              enable row level security;
alter table public.profiles          enable row level security;
alter table public.leads             enable row level security;
alter table public.outreach_sequences enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.content_topics    enable row level security;
alter table public.content_posts     enable row level security;
alter table public.jobs              enable row level security;
alter table public.activity_log      enable row level security;
alter table public.settings          enable row level security;

-- Helper: current org id for the logged-in user
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select org_id from public.profiles where id = auth.uid()
$$;

-- Policies: any row whose org_id matches the caller's org is visible/writable
do $$
declare t text;
begin
  for t in select unnest(array[
    'leads','outreach_sequences','outreach_messages',
    'content_topics','content_posts','jobs','activity_log','settings'])
  loop
    execute format($f$
      create policy %1$s_select on public.%1$s
        for select using (org_id = public.current_org_id());
    $f$, t);
    execute format($f$
      create policy %1$s_modify on public.%1$s
        for all using (org_id = public.current_org_id())
        with check (org_id = public.current_org_id());
    $f$, t);
  end loop;

  create policy profiles_self on public.profiles
    for all using (id = auth.uid()) with check (id = auth.uid());

  create policy orgs_self on public.orgs
    for all using (id = public.current_org_id())
    with check (id = public.current_org_id());
end$$;

-- Service-role bypass note: supabase service_role bypasses RLS; edge
-- functions that need cross-user work use the service role key.

-- ---------------------------------------------------------------------
-- Bootstrap helper: when a new auth user signs in, attach them to the
-- single default org and create their settings row.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_org uuid;
begin
  select id into v_org from public.orgs order by created_at asc limit 1;
  if v_org is null then
    insert into public.orgs (name, created_at)
      values ('Markenza', now())
      returning id into v_org;
  end if;

  insert into public.profiles (id, org_id, full_name, email)
    values (new.id, v_org,
            coalesce(new.raw_user_meta_data->>'full_name',''),
            new.email)
    on conflict (id) do nothing;

  insert into public.settings (org_id) values (v_org) on conflict do nothing;
  return new;
end$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
