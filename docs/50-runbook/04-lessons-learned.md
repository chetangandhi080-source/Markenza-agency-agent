# Lessons learned

> The things I wish I''d known when I started building this. Most
> apply to any Hermes-3-powered agent build, not just Markenza.

## Architecture

### Edge functions are the right unit of deployment

Not microservices in containers, not a Next.js API route, not a
Lambda. Deno + edge functions hit the sweet spot: cold starts are
fast, you deploy with `supabase functions deploy`, and the runtime
is the same locally and remotely. We tried mentally modeling this as
"Express app in a Docker container" first and it was the wrong
abstraction.

### The orchestrator + jobs pattern beats direct cron-to-agent

If pg_cron directly calls `outreach-generate`, then:
- Failures are invisible until you check
- A slow job blocks the next tick
- You can''t fan out work

Putting the orchestrator + jobs table in between adds ~50 lines of
code and gives you: retry with backoff, fan-out, per-job logging,
testable in isolation.

### RLS-first is cheaper than auth-first

We started with "let''s just add a `user_id` column and check it in
each function." That works for 2 functions and falls apart at 8.
RLS with a `current_org_id()` helper is the same effort upfront and
scales forever. Bonus: the React app in Phase 4 inherits the same
policies for free.

### Multi-tenant from day 1, even with one tenant

The schema has `org_id` on every table. The auth trigger creates a
singleton org. RLS uses the org. None of this is exercised in v1
because there''s one user. But when the time comes to add a second
agency, the work is a settings change, not a refactor.

## Hermes + prompts

### JSON mode is not magic

Hermes 3 405B in JSON mode produces parseable JSON ~92% of the time
on first call. The remaining 8% need a retry with a stricter system
nudge. The retry is non-negotiable — without it, jobs fail
intermittently and you can''t tell why.

### The system prompt is the product

`SYSTEM_PERSONA` is 14 lines of text. It defines:
- Who the agent is
- What it should never do
- The word budgets
- The voice

Changing 3 lines there has more impact than changing 30 lines of
edge function code. When reply rates drop, fix the persona first.

### Voice examples beat instructions

In `contentPostPrompt`, we pass 3 most-recent approved posts as
`voiceExamples` and tell the model to match the cadence. This works
better than any explicit description of "what our voice is" — the
model can see the voice. We added this in iteration 3 and it was the
single biggest jump in post quality.

### Don''t ask Hermes for 3 variants, ask for 1

Initial drafts of `contentPostPrompt` asked for "3 variants" so the
user could pick. We changed it to 1. Reasons:
- The model spreads its effort across 3 and each is worse
- Picking is its own time cost
- A second call with a different seed is cheaper than the model
  generating them in one shot (we just don''t do that yet)

## Data + state

### State machines are the most leveraged abstraction in the codebase

Every row has a `status` column with a small set of allowed values
and a documented transition graph. This makes the dashboard,
orchestrator, and follow-up scanner all trivial. The alternative —
event-sourced with a `state` JSON column — would be 5× the code and
1/5 the clarity.

### Log everything, but compactly

`activity_log` is append-only and every agent writes to it. It
saved us hours during debugging. The cost is one INSERT per action,
which is negligible. The lesson: cheap logging is always worth it.

### Soft-delete is a trap

We considered `deleted_at` on every table. Decided against it. Most
"deleted" data is actually "closed_lost" or "archived" — a real
state with a real meaning, not a deletion. If you ever genuinely
need to remove a row, hard-delete; the audit trail lives in
`activity_log` anyway.

## Operations

### Manual approval gates are non-negotiable for risky sends

LinkedIn DMs can get your account banned. Content posts are
publicly attributed to you. Emails can mark you as spam. Every
one of these has a manual gate. This adds ~5 min/day to ops, and
saves you from a worst-case "Hermes hallucinated a slur and posted
it" scenario.

### Daily caps belong in `settings`, not code

`settings.daily_email_cap` defaults to 40. Adjusting it is one
SQL UPDATE. Hardcoding the cap in `outreach-send` would mean a code
change and a redeploy for every experiment. Keep limits where you
can change them without redeploying.

### Cron needs a manual tick script

`scripts/tick.ps1` exists because you will, at some point, want to
trigger the orchestrator RIGHT NOW. Waiting 15 minutes for the next
scheduled tick while debugging is a waste of time. The script also
doubles as a "is this thing alive?" check.

## Tooling

### `supabase functions serve` + `Invoke-RestMethod` is enough for dev

We considered a full Postman / Insomnia setup. PowerShell +
`Invoke-RestMethod` is the same thing with zero extra dependencies.
For multi-step flows, a small `smoke.ps1` is the right amount of
ceremony.

### Idempotent migrations are free insurance

Every `create` in our migrations is `create … if not exists`.
Every trigger creation is gated on `pg_trigger`. This means
`supabase db push` is safe to re-run, which means you don''t have
to remember whether you already applied that patch. Cost: a few
extra lines per migration. Benefit: never debugging a
"trigger already exists" error in prod at 11pm.

### The `~/.codex/skills` pattern is worth copying

We structured the docs to mirror a skill manifest: one folder per
domain, one file per concept, every file leads with a 1-line
summary. This makes the docs skimmable for someone new and
searchable for someone returning. We will use the same pattern
in the React app''s component library.

## What I would do differently

- **Start with one agent, not two.** We built Outreach + Content
  in parallel. Doing Outreach first would have taught us the prompt
  patterns faster.
- **Write the prompts first, code second.** The prompts ARE the
  product; the code is plumbing. We coded plumbing first and
  iterated on prompts against a stub. Same outcome, more friction.
- **Skip Gmail SMTP, use Resend from day 1.** Gmail works but
  deliverability is a tax. Resend costs $20/mo and removes an
  entire category of bugs.
- **Build the IMAP reply detection in Phase 1, not Phase 3.** We
  treated reply handling as "later" and ended up doing manual
  triage for the first 4 weeks. Automating it earlier would have
  given us cleaner data sooner.

## What I would NOT change

- The choice of Supabase
- The choice of Hermes 3
- The state-machine approach
- The orchestrator + jobs pattern
- The "no frontend in v1" decision
- The decision to ship Phase 2 instead of building Phase 4 immediately
