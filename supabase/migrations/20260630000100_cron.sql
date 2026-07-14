-- =====================================================================
-- pg_cron schedule for the Markenza AI orchestrator
-- Runs every 15 minutes; the orchestrator edge function itself decides
-- which sub-agents to wake up based on time of day + job queue state.
-- =====================================================================

-- Replace any prior schedule with the same name so re-runs are safe.
select cron.unschedule('markenza_orchestrator_every_15m')
  where exists (select 1 from cron.job where jobname = 'markenza_orchestrator_every_15m');

select cron.schedule(
  'markenza_orchestrator_every_15m',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := current_setting(''app.settings.edge_base_url'', true)
              || '/functions/v1/orchestrator',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting(''app.settings.cron_secret'', true)
    ),
    body    := jsonb_build_object('source','pg_cron','tick_at', now())
  );
  $$
);

-- Helper: read secret safely (avoid leaking into cron.jobrun_details)
create or replace function public.markenza_invoke(function_name text, payload jsonb)
returns void
language plpgsql security definer as $$
begin
  perform net.http_post(
    url := current_setting('app.settings.edge_base_url', true)
          || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting('app.settings.cron_secret', true)
    ),
    body := payload
  );
end$$;
