-- CMS content persistence: brand + page content live in the cloud so every
-- device sees the same public site. This joins bookings/auth on Supabase.
--
-- Two documents are stored: 'site_settings' (brand identity, colors,
-- contact, analytics) and 'pages' (each route's hero content + SEO).
-- The public website reads them; staff write via the CMS. Publish changes
-- instantly reach every open tab through Realtime.

create table if not exists public.cms_content (
  id text primary key check (id in ('site_settings', 'pages')),
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

alter table public.cms_content enable row level security;

drop policy if exists "Public can read cms content" on public.cms_content;
drop policy if exists "Staff can write cms content" on public.cms_content;

create policy "Public can read cms content" on public.cms_content
  for select using (true);

create policy "Staff can write cms content" on public.cms_content
  for all to authenticated
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
