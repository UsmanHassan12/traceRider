-- Rider Trace database setup
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Safe to run once on a new project.

-- ───────────────────────── Tables ─────────────────────────

create table if not exists public.riders (
  id          text primary key,                 -- e.g. R-001
  name        text not null,
  phone       text not null default '',
  bike        text not null default '',
  licence     text not null default '',
  active      boolean not null default true,
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- One row per login. Links a Supabase Auth user to a role (and to a rider for rider logins).
create table if not exists public.staff (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'warehouse', 'rider')),
  rider_id    text references public.riders(id) on delete set null,
  name        text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.parcels (
  id                text primary key,             -- Shopify order name, e.g. #1047
  trk               text not null unique,         -- code inside the label QR
  shopify_order_id  text,
  customer          text not null,
  phone             text not null default '',
  address           text not null default '',
  area              text not null default '',
  item              text not null default '',
  cod               numeric not null default 0,
  otp               text not null,
  lat               double precision,
  lng               double precision,
  status            text not null default 'new'
                    check (status in ('new', 'labeled', 'handed', 'out', 'delivered', 'returned', 'received')),
  rider_id          text references public.riders(id) on delete set null,
  created_at        timestamptz not null default now(),
  ride_started_at   timestamptz,
  manual_scan       boolean not null default false,
  calls             jsonb not null default '[]'::jsonb,   -- call timestamps (ms)
  attempt           jsonb,                                 -- delivered / returned proof
  flags             text[] not null default '{}',
  review            jsonb,                                 -- admin decision on a flagged return
  is_sample         boolean not null default false,
  shopify_sync      text,                                  -- null, 'fulfilled', or 'error: …'
  shopify_synced_at timestamptz
);

-- Append-only custody log. Every handover, scan, call and outcome is a row here.
create table if not exists public.parcel_events (
  id          bigint generated always as identity primary key,
  parcel_id   text not null references public.parcels(id) on delete cascade,
  at          timestamptz not null default now(),
  what        text not null,
  by          text not null,
  kind        text
);

create table if not exists public.deposits (
  id          bigint generated always as identity primary key,
  rider_id    text not null references public.riders(id) on delete cascade,
  amount      numeric not null,
  at          timestamptz not null default now(),
  by          text not null
);

create index if not exists parcels_status_idx  on public.parcels (status);
create index if not exists parcels_rider_idx   on public.parcels (rider_id);
create index if not exists parcels_created_idx on public.parcels (created_at);
create index if not exists events_parcel_idx   on public.parcel_events (parcel_id);
create index if not exists events_at_idx       on public.parcel_events (at);
create index if not exists deposits_rider_idx  on public.deposits (rider_id, at);

-- ───────────────────────── Helpers ─────────────────────────

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where user_id = auth.uid()
$$;

create or replace function public.my_rider() returns text
language sql stable security definer set search_path = public as $$
  select rider_id from public.staff where user_id = auth.uid()
$$;

-- ───────────────────────── Row level security ─────────────────────────
-- Nobody without a staff row can read or write anything.

alter table public.riders        enable row level security;
alter table public.staff         enable row level security;
alter table public.parcels       enable row level security;
alter table public.parcel_events enable row level security;
alter table public.deposits      enable row level security;

-- riders: every staff member can read; only admins change
create policy riders_read   on public.riders for select to authenticated using (public.my_role() is not null);
create policy riders_insert on public.riders for insert to authenticated with check (public.my_role() = 'admin');
create policy riders_update on public.riders for update to authenticated using (public.my_role() = 'admin');
create policy riders_delete on public.riders for delete to authenticated using (public.my_role() = 'admin');

-- staff: you can read your own row; admins read and change all
create policy staff_read   on public.staff for select to authenticated using (user_id = auth.uid() or public.my_role() = 'admin');
create policy staff_write  on public.staff for all    to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- parcels: admin + warehouse see all; a rider sees only parcels handed to them
create policy parcels_read on public.parcels for select to authenticated
  using (public.my_role() in ('admin', 'warehouse') or (public.my_role() = 'rider' and rider_id = public.my_rider()));
create policy parcels_insert on public.parcels for insert to authenticated
  with check (public.my_role() in ('admin', 'warehouse'));
create policy parcels_update on public.parcels for update to authenticated
  using (public.my_role() in ('admin', 'warehouse') or (public.my_role() = 'rider' and rider_id = public.my_rider()))
  with check (public.my_role() in ('admin', 'warehouse') or (public.my_role() = 'rider' and rider_id = public.my_rider()));
create policy parcels_delete on public.parcels for delete to authenticated using (public.my_role() = 'admin');

-- events: readable/writable by whoever can see the parcel; never edited or deleted (except admin)
create policy events_read on public.parcel_events for select to authenticated
  using (exists (select 1 from public.parcels p where p.id = parcel_id));
create policy events_insert on public.parcel_events for insert to authenticated
  with check (exists (select 1 from public.parcels p where p.id = parcel_id));
create policy events_delete on public.parcel_events for delete to authenticated using (public.my_role() = 'admin');

-- deposits: rider sees own; admin + warehouse see all and record them
create policy deposits_read on public.deposits for select to authenticated
  using (public.my_role() in ('admin', 'warehouse') or rider_id = public.my_rider());
create policy deposits_insert on public.deposits for insert to authenticated
  with check (public.my_role() in ('admin', 'warehouse'));
create policy deposits_delete on public.deposits for delete to authenticated using (public.my_role() = 'admin');

-- ───────────────────────── Live updates ─────────────────────────

alter publication supabase_realtime add table public.parcels, public.parcel_events, public.deposits, public.riders;

-- ───────────────────────── First admin ─────────────────────────
-- 1. Supabase > Authentication > Users > Add user > Create new user
--    (enter your email + a password, tick "Auto Confirm User").
-- 2. Then run this, with your email:
--
-- insert into public.staff (user_id, role, name)
-- select id, 'admin', 'Your Name' from auth.users where email = 'you@example.com';
