-- Rider Trace update 2: Shopify fulfillment status on each parcel.
-- Paste into Supabase › SQL Editor › New query, then Run. Safe to run more than once.

alter table public.parcels add column if not exists shopify_sync text;          -- null, 'fulfilled', or 'error: …'
alter table public.parcels add column if not exists shopify_synced_at timestamptz;

create index if not exists parcels_shopify_order_idx on public.parcels (shopify_order_id);
