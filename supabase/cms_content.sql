-- CMS content persistence: brand + page content + generic CMS collections
-- (destinations, guides, vehicles, customers, media) live in the cloud so
-- every device sees the same public site. The public website reads these
-- rows; staff write via the CMS. Publish changes instantly reach every open
-- tab through Realtime.

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

alter table public.cms_content enable row level security;

-- Public read of all published documents.
drop policy if exists "Public can read cms content" on public.cms_content;
create policy "Public can read cms content"
  on public.cms_content
  for select using (true);

-- Staff write, with explicit WITH CHECK for INSERT/UPDATE.
drop policy if exists "Staff can insert cms content" on public.cms_content;
create policy "Staff can insert cms content"
  on public.cms_content for insert to authenticated
  with check (public.is_staff() or public.is_root_admin());

drop policy if exists "Staff can update cms content" on public.cms_content;
create policy "Staff can update cms content"
  on public.cms_content for update to authenticated
  using (public.is_staff() or public.is_root_admin())
  with check (public.is_staff() or public.is_root_admin());

drop policy if exists "Staff can delete cms content" on public.cms_content;
create policy "Staff can delete cms content"
  on public.cms_content for delete to authenticated
  using (public.is_staff() or public.is_root_admin());

-- Realtime: every open browser updates in-place.
do $$
begin
  alter publication supabase_realtime add table public.cms_content;
exception
  when duplicate_object then null;
  when undefined_object then
    execute 'create publication supabase_realtime';
    alter publication supabase_realtime add table public.cms_content;
end $$;

-- Seed empty defaults so the first sync has content; existing rows kept.
insert into public.cms_content (id, content) values
  ('site_settings', '{}'::jsonb),
  ('pages',         '[]'::jsonb),
  ('destinations',  '[]'::jsonb),
  ('guides',        '[]'::jsonb),
  ('vehicles',      '[]'::jsonb),
  ('customers',     '[]'::jsonb),
  ('media',         '[]'::jsonb)
on conflict (id) do nothing;
