-- ============================================================================
-- CMS CONTENT PERSISTENCE — global collections in `public.cms_content`
-- ============================================================================
-- The Studio CMS persists every collection to Supabase so changes are visible
-- on every device and browser. `site_settings` and `pages` already live in
-- this table; this migration adds the remaining JSON-document collections
-- (destinations, guides, vehicles, customers, media) by widening the primary
-- key's allowed id values.
--
-- It is idempotent, adds NO tables, drops NO tables, deletes NO data, and is
-- safe to run on a production database after supabase/cms_content.sql.
-- ============================================================================

-- 1. Widen the primary-key CHECK to include the new document ids. The existing
--    constraint only allowed ('site_settings','pages'), which made the CMS's
--    upsert of destinations/guides/etc. fail silently (RLS/constraint).
alter table public.cms_content drop constraint if exists cms_content_id_check;
alter table public.cms_content add constraint cms_content_id_check
  check (id in (
    'site_settings', 'pages',
    'destinations', 'guides', 'vehicles', 'customers', 'media'
  ));

-- 2. Ensure both well-known documents exist so first-load sync always has a row.
insert into public.cms_content (id, content) values
  ('site_settings', '{}'::jsonb),
  ('pages', '[]'::jsonb)
on conflict (id) do nothing;

-- 3. RLS: the public may read every document (these are website content), and
--    authenticated staff may write them. The policies are dropped and recreated
--    so they match the current canonical helper functions regardless of which
--    migration order was used historically. The write policy carries BOTH a
--    USING and WITH CHECK clause, otherwise an INSERT is not validated against
--    the staff predicate and the CMS save is rejected. RLS itself is never disabled.
alter table public.cms_content enable row level security;

drop policy if exists "Public can read cms content" on public.cms_content;
create policy "Public can read cms content" on public.cms_content
  for select using (true);

drop policy if exists "Staff can write cms content" on public.cms_content;
create policy "Staff can write cms content" on public.cms_content
  for all to authenticated
  using (public.is_staff() or public.is_root_admin())
  with check (public.is_staff() or public.is_root_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cms_content'
  ) then
    alter publication supabase_realtime add table public.cms_content;
  end if;
end $$;

-- 4. Verification (run manually after applying):
--    select id, length(content::text) from public.cms_content order by id;

-- 5. The frontend booking pipeline uses six statuses (New, Confirmed,
--    In planning, Cancelled, Completed, Refunded). The baseline schema only
--    allowed four, which made a staff status update fail. Widen the constraint
--    without deleting any existing row or value. Idempotent.
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in (
    'New', 'Confirmed', 'In planning', 'Cancelled', 'Completed', 'Refunded'
  ));
