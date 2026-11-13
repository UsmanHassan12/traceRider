-- Rider Trace update 5: auto-archive orders not delivered within 7 days.
-- Supabase › SQL Editor › New query › paste ALL of this › Run. Safe to run more than once.
--
-- Any order still waiting (needs label, ready, with rider, out for delivery) 7 days after it
-- arrived from Shopify moves to status 'archived'. Nothing is deleted: the earlier status is kept
-- in archived_from so an admin can restore it from Admin › Archive.

-- 1. new status + where it came from
alter table public.parcels drop constraint if exists parcels_status_check;
alter table public.parcels add constraint parcels_status_check
  check (status in ('new', 'labeled', 'handed', 'out', 'delivered', 'returned', 'received', 'archived'));

alter table public.parcels add column if not exists archived_from text;
alter table public.parcels add column if not exists archived_at   timestamptz;
alter table public.parcels add column if not exists restored_at   timestamptz;  -- restored orders get another 7 days from here
create index if not exists parcels_archived_idx on public.parcels (archived_at desc) where status = 'archived';

-- 2. the archiving job (admins and the warehouse desk may run it; the nightly schedule runs it too)
create or replace function public.archive_stale_parcels(days int default 7) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and coalesce(public.my_role(), '') not in ('admin', 'warehouse') then
    raise exception 'Only admins and the warehouse desk can archive orders';
  end if;
  with moved as (
    update public.parcels
       set archived_from = status, status = 'archived', archived_at = now()
     where status in ('new', 'labeled', 'handed', 'out')
       and coalesce(restored_at, created_at) < now() - make_interval(days => days)
    returning id, archived_from
  )
  insert into public.parcel_events (parcel_id, at, what, by, kind)
  select id, now(), 'Archived: not delivered within ' || days || ' days (was ' || archived_from || ')', 'System', 'bad'
    from moved;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.archive_stale_parcels(int) from public, anon;
grant execute on function public.archive_stale_parcels(int) to authenticated;

-- 3. run it every night at 2:00 am Pakistan time (21:00 UTC).
--    If pg_cron is not available this step is skipped; the app also runs the job whenever
--    an admin or the warehouse desk opens it, so archiving still happens.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'archive-stale-parcels';
  perform cron.schedule('archive-stale-parcels', '0 21 * * *', 'select public.archive_stale_parcels()');
exception when others then
  raise notice 'Nightly schedule not set (%). The app will still archive when an admin opens it.', sqlerrm;
end $$;

-- 4. archive whatever is already older than 7 days, right now
select public.archive_stale_parcels() as archived_now;
