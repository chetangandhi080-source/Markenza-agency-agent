# Daily operations (5 min)

> Every workday, in this order. Total time: ~5 min if there are no
> surprises, 15 min if there are.

## 1. Approve LinkedIn DMs

In Supabase Studio → Table Editor → `outreach_messages`:

- Filter: `status = draft AND channel = linkedin_dm`
- For each row:
  1. Read the body
  2. If it''s good, copy it, send it in LinkedIn, then:
     ```sql
     update outreach_messages
       set status = ''sent'', sent_at = now()
       where id = ''<id>'';
     ```
  3. If it needs editing, edit it in the row, save, then proceed
     as above
  4. If it''s bad, set `status = ''skipped''` so the follow-up scanner
     ignores it

## 2. Approve content posts

In Table Editor → `content_posts`:

- Filter: `status = pending_approval`
- For each row:
  1. Read the body
  2. Edit if needed
  3. Set `status = approved`
  4. Post on LinkedIn manually
  5. Set:
     ```sql
     update content_posts
       set status = ''published'', published_at = now(),
           publish_url = ''<linkedin-post-url>''
       where id = ''<id>'';
     ```

## 3. Glance at activity log

In Table Editor → `activity_log`:

- Filter: `created_at > now() - interval ''24 hours''`
- Look for any `failed` actions, any `bounced` emails, any errors

## 4. Glance at jobs

In Table Editor → `jobs`:

- Filter: `status = failed`
- For each, read the `error` column. Common patterns:
  - `Hermes 5xx` — public endpoint rate limit, wait an hour
  - `SMTP 535` — wrong app password, rotate
  - `Apify 401` — bad token, fix and requeue

To requeue a failed job:

```sql
update jobs set status = ''pending'', run_after = now(), attempts = 0
  where id = ''<id>'';
```

## 5. Reply triage (manual, 2 min)

In Table Editor → `leads`:

- Filter: `status = contacted AND last_touched_at > now() - interval ''48 hours''`
- If you see a new reply in your email:
  1. Find the lead (search by email or name)
  2. Set `status = replied` and store the reply text:
     ```sql
     update leads
       set status = ''replied'',
           enrichment = enrichment || jsonb_build_object(''reply_text'', ''<paste>'')
       where id = ''<id>'';
     ```
  3. The follow-up scanner will now skip this lead

If the reply is a meeting booking (Calendly fires, you see the invite):

```sql
update leads set status = ''meeting_booked'' where id = ''<id>'';
```

## 6. Stop (or continue)

That''s it for the day. The cron keeps running. The orchestrator will
queue the next batch of work. Tomorrow you''ll have new drafts to
review, same drill.
