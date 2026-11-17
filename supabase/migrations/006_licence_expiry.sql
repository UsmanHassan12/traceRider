-- Rider Trace update 6: driving licence expiry date.
-- Supabase › SQL Editor › New query › paste ALL of this › Run. Safe to run more than once.
-- The existing "licence" column now holds the licence number; the expiry date gets its own column.

alter table public.riders add column if not exists licence_expiry date;
