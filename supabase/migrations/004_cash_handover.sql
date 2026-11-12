-- Rider Trace update 4: two-sided cash handover.
-- Supabase › SQL Editor › New query › paste ALL of this › Run. Safe to run more than once.

alter table public.deposits add column if not exists request_id   text;          -- one-time code from the rider's QR
alter table public.deposits add column if not exists declared     numeric;       -- amount the rider said they were handing in
alter table public.deposits add column if not exists status       text not null default 'confirmed';
alter table public.deposits add column if not exists rider_note   text;
alter table public.deposits add column if not exists confirmed_at timestamptz;
alter table public.deposits add column if not exists resolved_by  text;

alter table public.deposits drop constraint if exists deposits_status_check;
alter table public.deposits add constraint deposits_status_check
  check (status in ('pending', 'confirmed', 'disputed', 'resolved'));

-- a QR can be used only once
create unique index if not exists deposits_request_idx on public.deposits (request_id) where request_id is not null;

-- riders answer their own deposits (accept or dispute); admins resolve disputes.
-- Only the answer columns can be changed, never the amount, rider or time.
drop policy if exists deposits_update on public.deposits;
create policy deposits_update on public.deposits for update to authenticated
  using (public.my_role() = 'admin' or rider_id = public.my_rider())
  with check (public.my_role() = 'admin' or rider_id = public.my_rider());

revoke update on public.deposits from authenticated;
grant update (status, rider_note, confirmed_at, resolved_by) on public.deposits to authenticated;
