# Markenza AI — Deep Research & Phase Plan

> Living documentation set for the Markenza AI backend. Built as a
> learning artifact so anyone (or future-us) can rebuild this on a new
> Supabase project in under an hour.

## How to read this

If you are new, read in order. Each document has a 1-line summary at
the top so you can skip ahead once you know the shape.

```
00-orientation/   Why this exists, who it serves, what it does NOT do
10-architecture/  How the pieces fit — system diagram, data model, control flow
20-phases/        Phase 0 → Phase 5 plan, with plug-and-play setup goals
30-research/      Background research — Hermes, Supabase, Apify, SMTP, prompt design
40-setup/         Plug-and-play setup guide (the "ship-it" doc)
50-runbook/       Daily / weekly / monthly operations + lessons learned
```

## The "I just want it to work" path

Read these four, in this order:
1. [00-orientation/01-product-brief.md](00-orientation/01-product-brief.md)
2. [20-phases/00-phase-overview.md](20-phases/00-phase-overview.md)
3. [40-setup/01-plug-and-play.md](40-setup/01-plug-and-play.md)
4. [50-runbook/01-daily-ops.md](50-runbook/01-daily-ops.md)

That is enough to deploy and run the v1.

## Conventions used across these docs

- **Channel codes:** `email` and `linkedin_dm` are the only outbound channels.
- **Step numbers:** outreach sequences are 1, 2, 3; each is a distinct message.
- **Status strings:** every table has a `status` column; the allowed
  values are documented in [10-architecture/03-data-model.md](10-architecture/03-data-model.md).
- **UTC everywhere in code.** IST is rendered only in the UI (later).
- **Hermes 3 405B is the default model** for the v1 build. Smaller
  models are used for cheap classification only.

## Versioning

| Doc set version | Date | Notes |
|---|---|---|
| 0.1.0 | 2026-07-14 | Initial drop alongside v0.1.0 of the code. |
