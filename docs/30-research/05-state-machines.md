# Research — State machines for outreach + content

> Why we model leads and messages as state machines, and what
> transitions are allowed.

## Why state machines

Cold outreach has a small number of meaningful states and a strict
order they progress through. Modeling the state as a single `status`
column on each row:

- Makes the dashboard trivially filterable (every view is a
  `WHERE status = ''X''`)
- Forces us to think about which transitions are legal
- Makes the orchestrator code small: each tick scans for leads in
  one state, advances them to the next

## Lead state machine

```
                       new
                        │
                        ▼
                   analyzing  (orchestrator claims generate job)
                        │
                  ┌─────┴─────┐
                  │           │
       fit_score<30│           │fit_score>=30
                  ▼           ▼
            closed_lost    qualified
                              │
                              ▼
                       message_ready
                              │
                  ┌───────────┴───────────┐
                  │                       │
            channel=email         channel=linkedin_dm
                  │                       │
                  ▼                       ▼
              contacted  ◀──── (human sends + tick) ────── contacted
                  │                       │
            (3 days, no reply)    (3 days, no reply)
                  │                       │
                  ▼                       ▼
            message_ready           message_ready
            (step 2)                (step 2)
                  …                       …
                  ▼                       ▼
            contacted              contacted
                  │
            (5 days, no reply)
                  │
                  ▼
            message_ready
            (step 3)
                  │
                  ▼
              contacted
                  │
            (7 days, no reply)
                  │
                  ▼
             closed_lost  (manual or auto after step 3 + 7d)
```

### Transitions that require a human

| From | To | How |
|---|---|---|
| any | `replied` | Studio edit |
| `replied` | `meeting_booked` | Studio edit (after Calendly fires) |
| any | `closed_won` | Studio edit |
| any | `do_not_contact` | Studio edit (or auto from `replies.sentiment = ''unsubscribe''` in Phase 3) |
| `closed_won/lost/do_not_contact` | any | **Not allowed** — terminal states |

### Transitions the orchestrator does

| From | To | Trigger |
|---|---|---|
| `new` | `analyzing` | claims a generate job |
| `analyzing` | `closed_lost` | fit_score < 30 |
| `analyzing` | `qualified` | analysis succeeded |
| `qualified` | `message_ready` | draft created |
| `message_ready` | `contacted` | email sent OR linkedin tick |
| `contacted` | `message_ready` | step+1 generated after delay |

## Message state machine

```
        ┌──────────┐
        │  draft   │  (linkedin only — never auto-sends)
        └────┬─────┘
             │ (human edits, then sends, then ticks)
             ▼
        ┌──────────┐
        │  sent    │
        └────┬─────┘
             │
   ┌─────────┼─────────┬──────────┐
   │         │         │          │
   ▼         ▼         ▼          ▼
delivered  replied   bounced    failed
  (future)  (manual) (manual)   (auto, retries then moves to
                                'skipped' for visibility)
```

Email-only:
```
        ┌──────────┐
        │  queued  │  (after Hermes drafts, before send)
        └────┬─────┘
             │ (orchestrator claims send job)
             ▼
        ┌──────────┐
        │  sent    │  → replied / bounced / failed
        └──────────┘
```

## Content post state machine

```
draft  (created by content-generate)
  │
  ▼
pending_approval
  │
  ├──── (human approves) ──→ approved
  │                              │
  │                              ▼
  │                          published
  │                              │
  │                              ▼
  │                          (published_at, publish_url set)
  │
  └──── (human rejects) ──→ rejected  (terminal)
```

`approved` is the "I''m going to post this on LinkedIn" state. The
post isn''t truly published until `published_at` is set. We keep these
separate so we can measure "approved but not published" lag (usually
a sign the post needs an image).

## What is NOT a state

- A lead''s `score` is not a state — it''s a number on the row.
  Two leads with the same status can have very different scores.
- The `step_number` on a message is not a state — it''s an attribute
  of the message. A lead with 3 sent messages is in state
  `contacted`, not `step_3`.

## Why the orchestrator is so small

Because state transitions are explicit, the orchestrator code is just:

```ts
if (hour === 10 || hour === 16) enqueue(outreach.followup);
if (hour === 7) enqueue(content.research);
```

All the actual work happens in the agents. The orchestrator only
decides *what* to run and *when*. State transitions live in the
agents.

## Debugging a stuck lead

Open Supabase Studio, find the lead, check:

1. `status` — where is it?
2. `last_touched_at` — when was it last updated?
3. `cooldown_until` — is it in a future cooldown?
4. `outreach_messages` for that lead — is the latest one `sent`, or
   stuck in `queued`?
5. `jobs` filtered by `payload->>''lead_id'' = ''<id>''` — is there a
   pending job for it?

In 95% of cases, the answer is in step 4: a message is `queued` but
the orchestrator hasn''t processed it yet. Wait 15 minutes, or hit
`scripts/tick.ps1` to force a tick.
