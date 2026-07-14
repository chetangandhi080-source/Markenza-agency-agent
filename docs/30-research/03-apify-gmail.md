# Research — Apify + Gmail

> The two real-world side effects in v1: scraping leads and sending
> email. Both have sharp edges.

## Apify

### What it is

A marketplace of "actors" — small serverless scrapers. You start an
actor, give it input (search URLs, max items), it returns a JSON
array of profiles.

### The actor we use

`bebity/linkedin-profile-scraper` is the default. It takes:

```json
{
  "searchUrls": ["https://www.linkedin.com/search/results/people/?keywords=..."],
  "maxItems": 25
}
```

It returns a JSON array. The schema varies by actor; our
`normalizeLinkedInProfile()` is tolerant of the common variants
(`fullName` / `full_name` / `name` / `firstName + lastName`,
`linkedinUrl` / `url` / `profileUrl`, etc.).

### LinkedIn Terms of Service

We do not pretend this is risk-free. LinkedIn actively blocks scraping
and bans accounts that scrape at volume. Mitigations:

- Default `maxItems = 25` per call (low volume)
- Manual consent: Chetan pastes the search URL; we don''t auto-rotate
- Per-call delay built into the actor (not our problem)
- Future: switch to LinkedIn''s official API (Sales Navigator) in
  Phase 5 — costs money, removes risk

### Alternatives

| Alternative | When to switch |
|---|---|
| **Apollo.io** | If Chetan wants emails + phones included; $49/mo |
| **Sales Navigator + official API** | Phase 5 multi-tenant; $100/mo per seat |
| **Google Maps scraper** (Apify) | When targeting local businesses; already supported in `apify.ts` via `runLinkedInScraper` being renamed in a follow-up |
| **Manual CSV upload** | Always supported via `source = ''manual''` |

### Quota management

- Apify free tier: $5/mo of compute, enough for ~500 profiles
- Apify paid: $49/mo + usage, enough for ~10k profiles
- We do not currently cache results; if a tick re-runs the same search
  URL, we re-pay Apify. Future: cache by search URL hash for 24h.

## Gmail SMTP

### What we need

- A Gmail account (or Google Workspace)
- A **2FA-enabled login**
- An **App Password** (Google disabled "less secure apps" in 2022;
  the only way to send from Gmail via SMTP now is an App Password)
- TLS on port 465 (we use this; we do not use STARTTLS on 587)

### How to get an App Password

1. Enable 2-Step Verification on the Google account
2. Go to https://myaccount.google.com/apppasswords
3. App name: "Markenza AI"
4. Copy the 16-char password (spaces don''t matter; we strip them)
5. Set `SMTP_PASS` to it in `supabase secrets set`

### What can go wrong

| Error | Cause | Fix |
|---|---|---|
| SMTP 535 | Wrong password or 2FA not enabled | Reset App Password |
| SMTP 534 | "Less secure app" — only happens if you skipped App Passwords | Use App Password |
| SMTP 421 | "Too many connections" — Gmail caps at ~15 concurrent | We open one at a time per send; the orchestrator caps at 5 concurrent jobs, so we''re under the cap |
| SMTP 452 | Storage quota exceeded | Recipient''s problem; mark `bounced` manually |
| TLS handshake failure | Wrong port | We hardcode 465; STARTTLS on 587 is not implemented |

### Deliverability

Cold email from a brand-new Gmail address gets flagged as spam ~50% of
the time. Mitigations:

- **Warm up the address first.** Send 5–10 manual emails to friends
  for a week before letting the agent loose.
- **Custom domain.** Better than `@gmail.com`. Set up
  `hi@markenza.ai` with Google Workspace ($7/mo) and authenticate the
  domain (SPF + DKIM + DMARC). v1 keeps Gmail for simplicity.
- **Daily cap.** `settings.daily_email_cap` defaults to 40. Stay under
  50/day for the first month.
- **Replies matter.** Every reply raises your sender reputation. The
  Phase 3 reply-detection work is partly about this.

### What we explicitly do NOT do

- We do not send HTML emails (text/plain only). HTML is the #1 spam
  signal for cold outbound.
- We do not include images, tracking pixels, or link shorteners.
- We do not use a "from" name other than the actual account name.
- We do not include "unsubscribe" links (CAN-SPAM requires them at
  scale; we are below the 500-email threshold but should add it in
  Phase 4 if volume grows).

## Resend / Postmark as alternatives

When you outgrow Gmail (likely at 200+ emails/day or when deliverability
becomes the bottleneck):

- **Resend** — $20/mo for 50k emails. Drop-in API.
- **Postmark** — $15/mo for 10k emails. Best-in-class deliverability.

Both work via HTTPS instead of SMTP, which is a small rewrite. The
`smtp.ts` module is the only thing that changes.
