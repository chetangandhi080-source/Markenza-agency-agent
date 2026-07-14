# 04 — Control Flow

> The four state machines that actually run the business. Sequence
> diagrams for the most important paths.

## 1. Lead → first email sent

```
1. pg_cron fires orchestrator
2. orchestrator: no jobs to drain, schedules
   - outreach.followup at 10:00 UTC
3. (separately) Chetan hits POST /outreach-discover with a
   LinkedIn search URL
4. outreach-discover:
   a. resolves caller (user JWT)
   b. Apify → fetch + normalize profiles
   c. dedupe by linkedin_url
   d. insert into leads (status=new)
   e. for each new lead: enqueue outreach.generate
   f. log leads.discovered
5. orchestrator next tick (within 15 min):
   a. claims outreach.generate job
   b. calls outreach-generate:
      - load lead
      - Hermes analysis → fit_score, channel, offer, hooks
      - if score < 30: lead → closed_lost, stop
      - else: Hermes draft → insert outreach_messages
        - email: status=queued, enqueue outreach.send
        - linkedin: status=draft, NO auto-send
      - lead → message_ready
6. (within same tick or next) orchestrator claims outreach.send:
   a. lead.email required
   b. Gmail SMTP send
   c. message → sent
   d. lead → contacted
   e. enqueue outreach.generate step=2 in 3 days
7. (3 days later) outreach-followup:
   - lead still contacted, last_touched > 3 days ago
   - enqueue outreach.generate step=2
8. outreach-generate step=2 (same function, different step arg):
   - lead → message_ready, message step=2 created
   - if email: enqueue send (sends immediately)
   - if linkedin: new draft appears in Studio
9. ... step 3 in another 5 days
```

## 2. Human posts a LinkedIn DM (manual)

```
1. Chetan opens Supabase Studio → outreach_messages
2. Filter: status=draft, channel=linkedin_dm
3. Copy body, paste into LinkedIn, hit Send
4. (Optional) Use the SQL editor to mark sent, or call the function:

   POST /functions/v1/outreach-send
   { "message_id": "...", "action": "linkedin_mark_sent" }

5. outreach-send:
   - message → sent
   - lead → contacted
   - enqueue outreach.generate step=2 in 3 days
```

## 3. Content topic → published post

```
1. orchestrator (07:00 UTC daily): enqueue content.research
2. content-research:
   - load settings.offer_summary
   - load last 20 topics
   - Hermes → list of N topics
   - insert as content_topics (status=idea)
3. Chetan (or a follow-on job): pick a topic, call:

   POST /functions/v1/content-generate
   { "topic_id": "...", "format": "text" }

4. content-generate:
   - Hermes → post body
   - insert content_posts (status=pending_approval)
   - mark topic → used
5. Chetan reviews in Studio:
   - status=pending_approval → status=approved (after edit if needed)
6. Chetan posts on LinkedIn manually
7. Chetan updates:
   - status=published
   - published_at=now()
   - publish_url=<linkedin-post-url>
```

## 4. Job retry / failure

```
1. orchestrator claims a job (status=pending → running)
2. calls the agent fn
3a. success:
    - job → succeeded, finished_at=now, result=...
3b. failure:
    - attempts+1 < max_attempts:
        - job → pending, run_after=now+backoff, error=...
    - attempts+1 >= max_attempts:
        - job → failed, finished_at=now
    - activity_log entry: <kind>.failed
```

## Concurrency notes

- The orchestrator is a single concurrent process per project (Supabase
  routes edge function invocations to workers, but the jobs table is
  updated with an optimistic `WHERE status = ''pending''` check, so two
  concurrent ticks cannot both claim the same job).
- Sub-agents (outreach-generate, content-generate) are NOT
  concurrency-safe on the same lead — if two tick at once they''d both
  analyse. This is OK in v1 because each lead has at most one queued
  generate job at a time, and the follow-up scheduler is bounded.
- Email send is the only side effect that mutates an external system.
  We rely on the unique `provider_msg_id` (SMTP message-id) for
  idempotency; re-sending the same job will get a new message-id and
  the lead will get a duplicate. We avoid this by failing the job
  after one SMTP attempt and requiring human intervention.
