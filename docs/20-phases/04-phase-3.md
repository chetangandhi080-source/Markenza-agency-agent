# Phase 3 — Cheaper models + reply detection

> Goal: drop inference cost, raise quality, close the reply loop.

## What changes

### 1. Two-tier model routing

Add a classification step that uses a smaller, cheaper model
(Hermes 3 8B, or even `gpt-4o-mini`) to decide *whether* to call the
big model.

```
lead profile
  → 8B classifier: "is this person an e-commerce founder?"
  → if yes: 405B analysis
  → if no:  mark closed_lost, skip
```

Implementation:
- New edge function: `outreach-classify`
- New env var: `HERMES_MODEL_FAST`
- Job kind: `outreach.classify`
- Orchestrator runs `outreach-classify` before `outreach-generate`

Cost estimate:
- 8B on Together AI: ~$0.0002/call
- 405B on Nous public: $0/call (today)
- Even when 405B becomes paid, 8B-first halves the bill

### 2. A/B testing on subject lines

Schema:
```sql
create table outreach_experiments (
  id uuid pk,
  name text,
  variants jsonb,         -- [{"key":"A","subject":"...","weight":0.5}, ...]
  started_at timestamptz,
  ended_at timestamptz
);
alter table outreach_messages add column experiment_key text;
alter table outreach_messages add column variant_key text;
```

Logic in `outreach-generate`:
- If a running experiment matches the lead segment, sample a variant
  by weight
- Record `experiment_key` and `variant_key` on the message
- Studio view: replies per variant

### 3. Reply detection via IMAP

Either:
- **Easy:** Chetan forwards replies to a unique `replies+<lead_id>@markenza.ai`
  address. A Supabase inbound webhook parses + writes to `replies`.
- **Harder:** poll IMAP every 5 min for messages matching the
  `In-Reply-To` or `References` header we set when we send.

Schema:
```sql
create table replies (
  id uuid pk,
  org_id uuid fk,
  lead_id uuid fk,
  message_id uuid fk,           -- the message they replied to
  body text,
  received_at timestamptz,
  sentiment text,                -- 'positive' | 'neutral' | 'unsubscribe' | 'out_of_office'
  classified_by text,            -- 'hermes' | 'rule'
  created_at timestamptz
);
```

When `replies.sentiment = ''unsubscribe''`:
- Set `leads.status = ''do_not_contact''`
- Set `leads.cooldown_until = now() + interval ''10 years''`
- Skip future follow-up jobs for that lead

When `sentiment = ''positive''`:
- Set `leads.status = ''replied''`
- Trigger a one-off `outreach-generate` with `step = ''reply''` (new
  prompt path for reply handling)

### 4. Hermes 405B prompt improvements

After 4–6 weeks of Phase 2 data:
- Export the 50 best-performing emails → fine-tune a small model
- Or: build a RAG index over past wins, retrieve top-3 examples in
  every `emailDraftPrompt` call

We do NOT fine-tune 405B. The path is: small classifier + RAG + cheap
generations.

## Tasks

- [ ] Add `outreach-classify` edge function
- [ ] Add `HERMES_MODEL_FAST` env var + wiring
- [ ] Add `outreach_experiments` table
- [ ] Add `replies` table + inbound webhook
- [ ] Add reply-classification prompt
- [ ] Build a Studio-friendly view: experiment results
- [ ] RAG over past winning emails (pgvector is already in the schema)

## Exit criteria

- Total inference cost per booked call < $1
- Reply detection latency < 15 min from email arrival
- A/B test shows >= 15% relative lift on at least one subject line

## Plug-and-play delta

`deploy.ps1 -Interactive` asks:
- "Do you want to enable reply detection? (y/n) — if y, paste IMAP creds"
- "Do you want to enable A/B testing? (y/n) — if y, name your first experiment"
