-- Rider Trace update 3: store proof photos as files instead of inside parcel records.
-- Supabase › SQL Editor › New query › paste ALL of this › Run. Safe to run more than once.

-- private bucket for doorstep / handover photos
insert into storage.buckets (id, name, public)
values ('proof', 'proof', false)
on conflict (id) do nothing;

-- any signed-in staff member (admin, warehouse, rider) can upload and view proof photos;
-- nobody can change or delete them from the app
drop policy if exists proof_insert on storage.objects;
create policy proof_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proof' and public.my_role() is not null);

drop policy if exists proof_read on storage.objects;
create policy proof_read on storage.objects for select to authenticated
  using (bucket_id = 'proof' and public.my_role() is not null);
