-- Rider Trace update 7: reattempts + daily email report.
-- Supabase › SQL Editor › New query › paste ALL of this › Run. Safe to run more than once.

-- 1. Every failed try the rider chose to reattempt, with its proof (reason, calls, photo, location).
alter table public.parcels add column if not exists attempts jsonb not null default '[]'::jsonb;

-- 2. App settings (daily report emails and time). Only admins can read or change them.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings
  for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

-- 3. The schedule. Every 15 minutes the database asks the app whether the daily report is due;
--    the app sends it once a day at the time set in Admin › Settings. The app sets this up itself
--    when an admin saves the settings, by calling the function below with its own address.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.set_report_schedule(url text, secret text) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'daily-report';
  if url is null or url = '' then
    return 'off';
  end if;
  perform cron.schedule(
    'daily-report',
    '*/15 * * * *',
    format(
      $job$select net.http_post(url := %L, headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', %L), body := '{}'::jsonb)$job$,
      url, secret
    )
  );
  return 'scheduled';
end $$;

-- only the app's server (service role) may change the schedule
revoke all on function public.set_report_schedule(text, text) from public, anon, authenticated;
grant execute on function public.set_report_schedule(text, text) to service_role;
