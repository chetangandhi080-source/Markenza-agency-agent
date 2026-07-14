# Phase 5 — Multi-tenant + self-serve

> Goal: turn Markenza AI from a one-person tool into a product that
> other solo agencies can pay to use.

## What changes

### Per-tenant config

Move every global env var into `settings` so each org has its own:

```
settings (already exists)
  + smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from
  + apify_token
  + hermes_api_key
  + buffer_access_token (Phase 4)
  + calendly_api_key (Phase 4)
  + stripe_customer_id, stripe_subscription_id
```

The `loadConfig()` helper is replaced by a per-request `loadOrgConfig(orgId)`
that reads from `settings` instead of env.

### Sign-up flow

- A new `signup` edge function (or the built-in Supabase Auth UI)
- Creates a new `org` per signup
- Seeds default `settings` row from a template
- Redirects to the React app

### Billing

- Stripe Checkout for the $99/mo plan
- A webhook listener that flips a `subscriptions.status` column
- The orchestrator checks subscription status before doing any work
  for an org

### Usage caps

- `daily_email_cap` and `daily_linkedin_cap` already exist in
  `settings`. Add `monthly_lead_cap` (default 500).
- Orchestrator checks caps before enqueueing outbound work.

### White-label mode

- `settings.brand_name`, `settings.brand_logo_url`, `settings.brand_color`
- All emails and content posts are templated with these
- The React app themes itself from the same row

## Why not sooner

Multi-tenant adds:
- 2× the QA surface (you now have to test org isolation)
- Real auth UI work
- Real billing
- Real support burden

It is the right move **only** when Phase 4 has validated that the
product is worth selling. Otherwise we are building a SaaS for an
audience of one.

## Tasks

- [ ] Move secrets into `settings` (with encryption-at-rest via pgcrypto)
- [ ] Build signup + onboarding wizard in the React app
- [ ] Stripe Checkout + webhook
- [ ] Usage caps enforced in the orchestrator
- [ ] White-label templating
- [ ] Admin panel: orgs, subscriptions, abuse

## Exit criteria

- A second solo agency signs up and runs Markenza AI without help
- Their reply rate is within 20% of the original Markenza account
- Stripe MRR covers hosting + inference cost with 50%+ margin

## Plug-and-play delta

The product is now SaaS. The "one command" deploy becomes
self-serve: sign up → wizard → running in 10 minutes.
