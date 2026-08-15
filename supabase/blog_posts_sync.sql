-- Blog posts: canonical table shared by the CMS and the public website.
-- Idempotent and safe to run on a database that already has an older
-- blog_posts table from schema.sql (which lacked several columns).

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  body jsonb not null default '{}'::jsonb,
  category text not null default 'Wildlife',
  hero_image text not null default '',
  seo_title text,
  seo_description text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill EVERY column the application reads. schema.sql created this table
-- without created_at/tags/author/etc — a missing column makes the public
-- SELECT fail outright, which is why the journal appeared empty.
alter table public.blog_posts add column if not exists created_at timestamptz not null default now();
alter table public.blog_posts add column if not exists updated_at timestamptz not null default now();
alter table public.blog_posts add column if not exists tags text[] not null default '{}';
alter table public.blog_posts add column if not exists author text;
alter table public.blog_posts add column if not exists author_id text;
alter table public.blog_posts add column if not exists reading_time integer not null default 5;
alter table public.blog_posts add column if not exists featured boolean not null default false;
alter table public.blog_posts add column if not exists comments integer not null default 0;
alter table public.blog_posts add column if not exists archived boolean not null default false;
alter table public.blog_posts add column if not exists seo_title text;
alter table public.blog_posts add column if not exists seo_description text;

-- Relax NOT NULL columns that the CMS may legitimately leave blank.
alter table public.blog_posts alter column excerpt set default '';
alter table public.blog_posts alter column hero_image set default '';
update public.blog_posts set excerpt = '' where excerpt is null;
update public.blog_posts set hero_image = '' where hero_image is null;

-- Widen category to the full editorial set the CMS offers.
alter table public.blog_posts drop constraint if exists blog_posts_category_check;
alter table public.blog_posts
  add constraint blog_posts_category_check
  check (category in ('Wildlife', 'Travel', 'Visa', 'Packing', 'Photography', 'Conservation', 'Culture'));

create index if not exists blog_posts_published_at_idx on public.blog_posts(published_at desc) where archived = false;
create index if not exists blog_posts_slug_idx on public.blog_posts(slug);

create or replace function public.blog_posts_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists blog_posts_touch_trigger on public.blog_posts;
create trigger blog_posts_touch_trigger
  before update on public.blog_posts
  for each row execute function public.blog_posts_touch();

alter table public.blog_posts enable row level security;

drop policy if exists "Public can read published posts" on public.blog_posts;
drop policy if exists "Staff can manage posts" on public.blog_posts;
drop policy if exists "Anyone can read published posts" on public.blog_posts;
drop policy if exists "Staff can read every post" on public.blog_posts;

-- IMPORTANT: the public policy must not call any helper function. If
-- public.is_staff() is absent the whole SELECT errors for anonymous
-- visitors and the journal renders empty. Permissive policies are OR-ed,
-- so staff still see drafts through the second policy below.
create policy "Anyone can read published posts" on public.blog_posts
  for select
  using (archived = false and published_at is not null and published_at <= now());

create policy "Staff can read every post" on public.blog_posts
  for select to authenticated
  using (public.is_staff());

create policy "Staff can manage posts" on public.blog_posts
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Anonymous visitors need the table-level SELECT grant before RLS applies.
grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'blog_posts'
  ) then
    alter publication supabase_realtime add table public.blog_posts;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Verification (run after the migration):
--   select id, slug, title, category, published_at, archived from public.blog_posts;
--   -- Anonymous view (should list only live posts):
--   set role anon; select slug, title from public.blog_posts; reset role;
-- ---------------------------------------------------------------------------
