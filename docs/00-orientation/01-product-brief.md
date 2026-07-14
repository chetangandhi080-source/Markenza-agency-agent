# 01 — Product Brief

> One page. The why, the who, the what.

## The business

Markenza is a one-person digital marketing agency run by Chetan
selling AI Automation, Google Ads, and Performance Marketing services
to e-commerce, coaches/consultants, local businesses, and white-label
agencies. Average deal: $500–$1,500/mo.

## The pain

Outreach and content production happen in bursts when Chetan has time.
Client count swings between 2 and 5 because there is no system — every
"find new clients" cycle restarts from zero.

## The job to be done

> "When I have a slow week, I want outreach and content to keep
> running on autopilot, so my pipeline doesn't dry up."

## The solution (in one sentence)

Two cooperating agents — **Outreach Agent** and **Content Agent** —
share a single Supabase database, are driven by Hermes 3 for analysis
and writing, and run on a daily cron so outreach + content happen
without Chetan remembering to do them.

## Explicitly out of scope for v1

- React frontend (Supabase Studio is the dashboard for now)
- Auto-sending LinkedIn DMs (manual send + tick to avoid account bans)
- Multi-tenant orgs (schema is ready, only one org is ever used)
- Calendar / meeting booking (Calendly link goes in the email signature)
- A/B testing of subject lines (later, after we have reply data)
- Reply detection (later, needs IMAP polling or LinkedIn scraping)

## Success criteria for v1

- 4–6 qualified discovery calls per month
- < 15 minutes/day of human time on the system
- A clean audit trail (every action lands in `activity_log`)
- 100% of outbound LinkedIn DMs are human-approved before send
