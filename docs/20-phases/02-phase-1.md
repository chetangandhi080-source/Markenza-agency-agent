# Phase 1 — Manual templates, real APIs

> Goal: send 50+ real cold emails + 30+ real LinkedIn DMs using hand-
> written templates. Capture reply data. **Hermes is NOT used yet.**

## Why

Templates ground the agent in real market feedback. We do not want
to optimize Hermes on synthetic prompts.

## Tasks

- [x] Deploy to a real Supabase project
- [x] Wire Apify for lead discovery
- [x] Wire Gmail SMTP for outbound
- [x] Seed 3 outreach_sequences (email / linkedin / followup)
- [x] Manual workflow: discover → paste template → send
- [ ] Add a `manual` outreach path: a Studio form that lets Chetan
      paste a template and apply it to a batch of leads in one click
- [ ] Daily log: replies received, opens (if Instantly.ai is added)

## What is manually driven in Phase 1

- Topic research: Chetan brainstorms 1 topic/day, posts manually
- Lead analysis: Chetan eyeballs each lead, scores it 0–5
- Drafting: Chetan uses a personal swipe file, customizes per lead
- Follow-up timing: Chetan remembers (this is the failure mode the
  PRD documents)

## Hermes usage

**None.** This is the point. We build up the data Hermes will later
train on.

## Data we collect

- Lead profile (raw_profile from Apify)
- Message sent (subject + body) — store in `outreach_messages`
- Reply received (manual) — set `status = replied`, save text in
  `enrichment.reply_text` (or new `replies` table)
- Outcome: `meeting_booked` or `closed_lost` (manual flag)

## Exit criteria

- 50+ replies received across email + LinkedIn
- Reply rate >= 5% on email (industry baseline for cold is 1–3%, so
  5% means templates are above average and worth automating)
- `SYSTEM_PERSONA` in `prompts.ts` is now informed by real examples,
  not just the PRD''s voice description

## Plug-and-play delta

After Phase 1, `deploy.ps1` should:
- Optionally take `-SeedDemoData` to insert 3 demo sequences
- Print "Open Studio, go to outreach_sequences to edit templates" at
  the end
