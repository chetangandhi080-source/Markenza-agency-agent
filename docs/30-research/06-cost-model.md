# Research — Cost model

> How much this costs to run. All numbers are monthly USD estimates
> at the time of writing (2026-07).

## Per-lead cost

| Component | Cost |
|---|---|
| Apify (per profile) | ~$0.005 (Pro plan, $49/mo includes some free credits) |
| Hermes 405B analysis (1 call) | ~$0.003 (Together AI) or $0 (Nous public) |
| Hermes 405B email draft (1 call) | ~$0.005 or $0 |
| Hermes 405B follow-up drafts (avg 1.5 calls) | ~$0.0075 or $0 |
| Hermes 405B content research (1/week shared) | ~$0.005 or $0 |
| Gmail SMTP | $0 (within Google Workspace or free Gmail) |
| Supabase Pro | $25 (covers everything except the React app) |
| **Total per lead (Hermes 405B paid)** | **~$0.05** |
| **Total per lead (Hermes public endpoint)** | **~$0.03** |

For 200 leads/month: **$6** in inference + **$25** Supabase + **$49** Apify = **~$80/mo**.

## Per-call-booked cost

| Stage | Rate (industry baseline) | For 200 leads/mo |
|---|---|---|
| Lead → reply | 5–10% | 10–20 replies |
| Reply → call booked | 30% | 3–6 calls |
| Cost per call booked | | **~$15–25** |

This is the metric to optimize. The Phase 3 work (8B classifier +
reply detection + A/B) is targeted at cutting this number in half.

## Scaling assumptions

- 5 leads discovered per day (Apify + search URLs = ~25/wk)
- 3 outreach messages per lead (step 1, 2, 3) = 15 messages/day
- 2 content posts per week
- 1 weekly research batch (5 topics)

The orchestrator processes 5 jobs per tick, runs every 15 minutes,
so up to 480 jobs/day of capacity. We use ~20. Plenty of headroom.

## What costs scale super-linearly

- **Hermes 405B usage**, if Nous starts charging market rate
  ($3/1M tokens): at 200 leads × 5K output tokens/day = 30M tokens = $90/mo. Acceptable.
- **Apify**, if you discover 10K+ profiles/month: you''ll need the
  Scale plan ($499/mo) or to switch to a self-hosted scraper.
- **Gmail SMTP**, at 500+ emails/day: Google will throttle and flag
  spam. Move to Resend or Postmark.
- **Edge function invocations**, at 1M+/month: Supabase Pro includes
  2M; you''re fine.

## What does NOT scale

- Manual human approval. Phase 4 removes the bottleneck with the
  React app + auto-publish.
- Studio query performance. The Studio is fine for 100K rows; beyond
  that, you want the React app + materialized views.

## Cost-saving levers (in order of impact)

1. **Move to Hermes 8B for classification** (Phase 3) — halves inference cost
2. **Cache Apify results by search URL hash** — 30% saving on discovery
3. **Pre-render carousel slides** — saves a Hermes call per post
4. **Switch to Resend** at scale — $20/mo for 50k vs Gmail''s spam-flagging risk
5. **Self-host Hermes on a single H100** if you exceed $200/mo on
   Together AI

## What is intentionally NOT optimized in v1

- No response streaming
- No request batching
- No embedding precomputation
- No prompt caching
- No model fine-tuning

These are all easy wins once we know what actually works. Optimizing
them now would be premature.
