# Weekly review (20 min)

> Every Friday. The place to look at the system as a whole and make
> one change.

## 1. Funnel snapshot

Run in SQL editor:

```sql
select status, count(*) as n
from leads
where created_at > now() - interval ''7 days''
group by status
order by status;
```

You should see something like:

```
status              n
new                 8
qualified           12
message_ready       5
contacted           15
replied             3
meeting_booked      1
closed_won          0
closed_lost         4
```

If `replied / contacted` < 5%, your messages aren''t resonating. Open
the most recent 10 `outreach_messages` rows and read them cold — would
*you* reply?

## 2. Reply rate by channel

```sql
select channel, count(*) filter (where status = ''replied'') as replies,
       count(*) as sent
from outreach_messages
where sent_at > now() - interval ''7 days''
group by channel;
```

If `linkedin_dm` reply rate is 3× `email`, lean into LinkedIn. If
they''re equal, you have headroom to grow both.

## 3. Content performance

```sql
select id, title, pillar, published_at, publish_url
from content_posts
where status = ''published''
order by published_at desc
limit 5;
```

Click each `publish_url`. Note the impressions / comments (manually,
for now — Phase 4 will pull this from the LinkedIn API). If a pillar
consistently outperforms, double down.

## 4. Job health

```sql
select kind, status, count(*), avg(attempts) as avg_attempts
from jobs
where created_at > now() - interval ''7 days''
group by kind, status
order by kind, status;
```

If any `failed` count > 0 for `outreach.generate`, the most likely
cause is a Hermes regression or a prompt that needs tightening. Read
3 failed-job `error` messages, look for the pattern.

## 5. Make one change

Pick the single most impactful change to make next week. Common ones:

- **Subject line underperforming** → tighten `SYSTEM_PERSONA` or
  `emailDraftPrompt`
- **LinkedIn DMs too long** → reduce `linkedinDraftPrompt` word budget
- **Lead quality low** → refine search URLs you pass to
  `outreach-discover`
- **One pillar is hot** → boost it in `contentTopicPrompt`
- **CRM getting cluttered** → archive old `closed_lost` rows

Make the change. Re-deploy. Note the date in a commit message. Watch
next week''s numbers.

## 6. Backup

```sql
-- Dump the activity log (small, fits in a gist)
copy (select * from activity_log order by created_at desc limit 1000)
  to stdout with csv header;

-- Dump any single table you care about
copy leads to stdout with csv header;
```

Or use `supabase db dump --local > backup.sql` for a full local copy.

## 7. Cadence check

Are the 3 follow-up steps firing on schedule? Run:

```sql
select step_number, status, count(*)
from outreach_messages
where created_at > now() - interval ''14 days''
group by step_number, status
order by step_number, status;
```

You should see step 1 → step 2 → step 3 in declining counts. If step
2 is barely firing, the 3-day delay in `outreach-send` is too long.
Adjust the `Date.now() + X * 86_400_000` constants in
`outreach-send/index.ts`.

## 8. Plan next week''s content

Either:
- Hand-pick 5 topics from `content_topics` and queue
  `content-generate` for each, or
- Let the weekly 08:00 UTC Monday research batch do it

The latter is the default. The former is for when you have a
specific campaign in mind.
