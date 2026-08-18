-- CMS content persistence: brand + page content live in the cloud so every
-- device sees the same public site. This joins bookings/auth on Supabase.
--
-- Two documents are stored: 'site_settings' (brand identity, colors,
-- contact, analytics) and 'pages' (each route's hero content + SEO).
-- The public website reads them; staff write via the CMS. Publish changes
-- instantly reach every open tab through Realtime.

-- Note: additional document ids (destinations, guides, vehicles, customers,
-- media) are added by supabase/cms_content_persistence.sql, which also installs
-- the canonical RLS policies. Run it after this file on existing databases.
create table if not exists public.cms_content (
  id text primary key check (id in (
    'site_settings', 'pages',
    'destinations', 'guides', 'vehicles', 'customers', 'media'
  )),
  content jsonb not null,
  updated_at timestamptz not null default now()
);

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

-- These helpers are defined authoritatively by
-- supabase/role_canonicalization.sql (and supabase/auth_schema_sync.sql).
-- Define safe fallbacks here so this file can run on its own; the real
-- definitions use "create or replace" and overwrite these without conflict.
create or replace function public.is_root_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
      and (is_root = true or role in ('root', 'root_super_admin'))
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
      and (
        is_root = true
        or role in (
          'root', 'root_super_admin', 'super_admin',
          'content_manager', 'editor',
          'booking_manager', 'reservation_manager', 'reservation', 'bookings',
          'marketing_manager', 'marketing',
          'finance'
        )
      )
  );
$$;

alter table public.cms_content enable row level security;

drop policy if exists "Public can read cms content" on public.cms_content;
drop policy if exists "Staff can insert cms content" on public.cms_content;
drop policy if exists "Staff can update cms content" on public.cms_content;
drop policy if exists "Staff can delete cms content" on public.cms_content;
-- Legacy single policy name, removed in favour of the per-command policies.
drop policy if exists "Staff can write cms content" on public.cms_content;

-- Anyone (including anonymous visitors) may read website content.
create policy "Public can read cms content" on public.cms_content
  for select using (true);

-- Authenticated staff may write. The policies are split per command rather
-- than using a single "for all" policy, which is the most portable form and
-- validates inserts against WITH CHECK explicitly (a standalone "for all"
-- policy with only USING has been reported to raise a syntax error on some
-- Supabase/Postgres versions).
create policy "Staff can insert cms content" on public.cms_content
  for insert to authenticated
  with check (public.is_staff() or public.is_root_admin());

create policy "Staff can update cms content" on public.cms_content
  for update to authenticated
  using (public.is_staff() or public.is_root_admin())
  with check (public.is_staff() or public.is_root_admin());

create policy "Staff can delete cms content" on public.cms_content
  for delete to authenticated
  using (public.is_staff() or public.is_root_admin());

-- Realtime: every open browser tab updates in-place.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cms_content'
  ) then
    alter publication supabase_realtime add table public.cms_content;
  end if;
end $$;

-- Seed the defaults so the first sync has content.
insert into public.cms_content (id, content) values
  ('site_settings', '{}'::jsonb),
  ('pages', '[]'::jsonb)
on conflict (id) do nothing;
