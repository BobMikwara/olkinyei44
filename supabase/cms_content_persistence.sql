-- ============================================================================
-- Global CMS persistence fix
--
-- Root cause:
--   The CMS stores JSON documents (site_settings, pages, destinations,
--   guides, vehicles, customers, media) in public.cms_content. The table
--   originally had CHECK (id IN ('site_settings','pages')), so every upsert
--   for destinations/guides/vehicles/customers/media was REJECTED by Postgres.
--   Those changes therefore never reached the database and were invisible to
--   other browsers and devices.
--
-- This migration is idempotent and safe to re-run. It does not delete any
-- tables, columns, rows, or data.
-- ============================================================================

-- 1. Helper functions used by RLS. Defined here so this migration is
--    self-contained even if run on a fresh database. They are also defined
--    (identically) in role_canonicalization.sql / auth_schema_sync.sql;
--    CREATE OR REPLACE makes re-running harmless.

create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin', 'admin', 'content_manager',
                     'booking_manager', 'marketing_manager', 'finance')
  );
$$;

create or replace function public.is_root_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'super_admin'
  );
$$;

-- 2. Ensure the cms_content table exists (it is created in cms_content.sql,
--    but guard against a partial/provisioned database).
create table if not exists public.cms_content (
  id text primary key,
  content jsonb not null,
  updated_at timestamptz not null default now()
);

-- 3. Widen the primary-key CHECK so every collection the CMS writes is
--    accepted. Drop the old constraint (whatever its generated name) and add
--    the complete allowed set. DO NOT drop the table or its data.
do $$
declare
  con_name text;
begin
  -- Find the existing CHECK constraint on cms_content.id, if any.
  select c.conname
    into con_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname  = 'cms_content'
    and c.contype  = 'c'
    and pg_get_constraintdef(c.oid) ilike '%id in%';

  if con_name is not null then
    execute format('alter table public.cms_content drop constraint %I', con_name);
  end if;

  alter table public.cms_content
    add constraint cms_content_id_check
    check (id in (
      'site_settings', 'pages',
      'destinations', 'guides', 'vehicles', 'customers', 'media'
    ));
end $$;

-- Keep updated_at fresh on every update (re-created idempotently).
create or replace function public.cms_content_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists cms_content_touch_trigger on public.cms_content;
create trigger cms_content_touch_trigger
  before update on public.cms_content
  for each row execute function public.cms_content_touch();

-- 4. RLS: public may read published content; only staff may write.
--    Use explicit separate policies with USING (read) and WITH CHECK
--    (write validation) so inserts/updates for all document ids succeed.
alter table public.cms_content enable row level security;

drop policy if exists "Public can read cms content" on public.cms_content;
create policy "Public can read cms content"
  on public.cms_content
  for select
  using (true);

drop policy if exists "Staff can insert cms content" on public.cms_content;
create policy "Staff can insert cms content"
  on public.cms_content
  for insert
  to authenticated
  with check (public.is_staff() or public.is_root_admin());

drop policy if exists "Staff can update cms content" on public.cms_content;
create policy "Staff can update cms content"
  on public.cms_content
  for update
  to authenticated
  using (public.is_staff() or public.is_root_admin())
  with check (public.is_staff() or public.is_root_admin());

drop policy if exists "Staff can delete cms content" on public.cms_content;
create policy "Staff can delete cms content"
  on public.cms_content
  for delete
  to authenticated
  using (public.is_staff() or public.is_root_admin());

-- 5. Realtime: ensure every CMS-edited table is in the supabase_realtime
--    publication so open browsers receive INSERT/UPDATE/DELETE immediately.
--    (cms_content, blog_posts, packages, testimonials, bookings are added in
--    their own migrations; this guarantees all of them are present.)
do $$
begin
  alter publication supabase_realtime add table public.cms_content;
exception
  when duplicate_object then null; -- already a member
  when undefined_object then
    -- Publication may not exist on a fresh local DB; create it.
    execute 'create publication supabase_realtime';
    alter publication supabase_realtime add table public.cms_content;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.blog_posts;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.packages;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.testimonials;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.bookings;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- 6. Seed empty default documents so the first read is well-formed. Existing
--    rows are preserved by ON CONFLICT DO NOTHING.
insert into public.cms_content (id, content) values
  ('site_settings', '{}'::jsonb),
  ('pages',         '[]'::jsonb),
  ('destinations',  '[]'::jsonb),
  ('guides',        '[]'::jsonb),
  ('vehicles',      '[]'::jsonb),
  ('customers',     '[]'::jsonb),
  ('media',         '[]'::jsonb)
on conflict (id) do nothing;
