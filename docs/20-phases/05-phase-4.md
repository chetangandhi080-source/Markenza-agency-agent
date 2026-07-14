# Phase 4 — React frontend + content publishing

> Goal: replace Supabase Studio with a real product. Add content
> publishing automation (Buffer / Taplio).

## What ships

### React app (Next.js 14, App Router)

```
app/
  layout.tsx                -- shell with sidebar
  page.tsx                  -- dashboard: numbers, recent activity
  leads/
    page.tsx                -- table + filters
    [id]/page.tsx           -- detail view + message history
  outreach/
    page.tsx                -- pipeline kanban
  content/
    page.tsx                -- editorial calendar
  settings/
    page.tsx                -- offer summary, ICP, send caps
```

Auth: Supabase Auth UI. The app uses the anon key + user JWT;
RLS does the rest.

### Content publishing

- **Buffer** for LinkedIn + Twitter: API key in env, `content_posts`
  can flip to `published` automatically.
- **Taplio** for LinkedIn carousels: optional, nicer rendering.
- **Manual fallback** always available (post by hand, set
  `publish_url`).

### Calendly integration

- Each email signature includes a Calendly deep link
  `?utm_source=markenza-ai&utm_campaign=outreach&utm_content=<lead_id>`
- A Supabase Edge Function (or webhook from Calendly) updates
  `leads.status = ''meeting_booked''` when someone books

### Real-time dashboard

- Supabase Realtime channel on `activity_log` so the dashboard
  updates without polling

## Why now

By Phase 4 we should be at 6+ calls/month. Studio is workable but
slow. The real product needs a 30-second loop: see new lead → read
draft → approve → done. React + Realtime is the cheapest way to get
that.

## Tasks

- [ ] Init Next.js 14 app
- [ ] Auth flow
- [ ] Dashboard view
- [ ] Leads table with filter + bulk actions
- [ ] Outreach kanban (drag-and-drop status changes)
- [ ] Content calendar view
- [ ] Settings page
- [ ] Buffer integration + env wiring
- [ ] Calendly webhook

## Exit criteria

- Chetan can run the system from the React app with zero Studio visits
- Buffer autopublish saves 5+ min/post
- 6+ calls/month booked consistently

## Plug-and-play delta

`deploy.ps1` now deploys the Next.js app to Vercel/Cloudflare Pages
as a final step (or prints a one-liner for manual deploy).
