# Phase Plan — Overview

> Six phases. Each is independently shippable. The current code is
> **Phase 1 done**; the rest is a build plan.

## Why phase it

The PRD explicitly calls this out: building the full custom agent
before validating the message-market fit risks 2–3 months of
engineering on unproven copy. We split the build so each phase is
de-risked by the previous one''s real-world data.

## Phase summary

| Phase | What ships | Gate to next |
|---|---|---|
| **Phase 0** | Local Supabase + this repo running locally, empty DB | All functions return 200 from `supabase functions serve` |
| **Phase 1** | Real Supabase project, real Apify + Gmail, no Hermes analysis yet — manual templates only | 20+ real replies received |
| **Phase 2** *(current code)* | Hermes 3 analysis + drafting wired in, manual LinkedIn, auto email | 50+ replies; fit_score distribution looks bimodal |
| **Phase 3** | Hermes 405B → smaller Hermes 8B for classification; A/B on subject lines; reply detection via IMAP | 4+ calls/month booked |
| **Phase 4** | React frontend (Next.js) for the dashboard; Buffer/Taplio for content publish; Calendly deep link tracking | 6+ calls/month booked |
| **Phase 5** | Multi-tenant; per-org SMTP + Apify; Stripe self-serve; usage-based billing | 1 paying customer on the platform |

## Plug-and-play goal

By the end of Phase 2 the deploy is one command:

```powershell
.\scripts\deploy.ps1 -ProjectRef <ref>
```

By the end of Phase 3 it is one command + a wizard:

```powershell
.\scripts\deploy.ps1 -ProjectRef <ref> -Interactive
```

The wizard answers: SMTP creds, Apify token, ICP personas, offer
summary, and content pillars. Everything else is in the repo and
deployable as-is.

## The plug-and-play contract (a Definition of Done)

A "plug-and-play Hermes agent setup" means:

1. **One command to deploy** — link + push + functions + secrets.
2. **One command to bootstrap the user** — create auth + link org.
3. **One command to smoke-test** — orchestrator + every agent returns 200.
4. **Hermes is a swappable dependency** — change `HERMES_BASE_URL`
   and `HERMES_MODEL` to point at OpenAI, Anthropic, Ollama, vLLM, or
   any other OpenAI-compatible endpoint. No code changes.
5. **Every agent is callable from Studio** — via the SQL editor or
   Table Editor in one click (using the function invocation button).
6. **All secrets are env-var based** — nothing in code, no hardcoded
   keys, no `secrets.json` in the repo.
7. **No destructive migrations** — re-running any migration is a
   no-op (idempotent CREATE / IF NOT EXISTS everywhere).
8. **The README fits on one screen of text** — the "ship-it" section
   is < 20 lines.

The current code already meets 1, 2, 3, 4, 5, 6, 7, and (close to) 8.
