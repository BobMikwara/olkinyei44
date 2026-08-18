-- ============================================================================
-- SUPABASE STORAGE — CMS media persistence
-- ============================================================================
-- The CMS now uploads logos, safari images, blog heroes and media-library
-- assets to Supabase Storage (the public `expedition-media` bucket) and saves
-- the returned public URL to the database. This makes those images load on
-- every device/browser instead of living as a base64 blob in one browser.
--
-- Idempotent. Safe to re-run. Creates the bucket if it does not exist and
-- (re)installs the read/write policies using the canonical staff helpers.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('expedition-media', 'expedition-media', true)
on conflict (id) do update set public = true;

-- Public read: every image is served to anonymous website visitors.
drop policy if exists "Public expedition media" on storage.objects;
create policy "Public expedition media" on storage.objects
  for select using (bucket_id = 'expedition-media');

-- Authenticated staff can upload, update, and delete. The WITH CHECK clause
-- is required so an INSERT is validated against the staff predicate (a USING
-- clause alone does not cover inserts).
drop policy if exists "Staff upload expedition media" on storage.objects;
create policy "Staff upload expedition media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'expedition-media' and (public.is_staff() or public.is_root_admin()));

drop policy if exists "Staff update expedition media" on storage.objects;
create policy "Staff update expedition media" on storage.objects
  for update to authenticated
  using (bucket_id = 'expedition-media' and (public.is_staff() or public.is_root_admin()))
  with check (bucket_id = 'expedition-media' and (public.is_staff() or public.is_root_admin()));

drop policy if exists "Staff delete expedition media" on storage.objects;
create policy "Staff delete expedition media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'expedition-media' and (public.is_staff() or public.is_root_admin()));
