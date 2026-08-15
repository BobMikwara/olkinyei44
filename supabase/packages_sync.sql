-- ============================================================================
-- SAFARI PACKAGES — single source of truth (`public.packages`)
-- ============================================================================
-- The public website and the Studio CMS both read Safari Packages from
-- `public.packages`. This file is the authoritative, idempotent schema for
-- that table: it aligns every column the application consumes, installs the
-- RLS policies that let staff read/write every package (and anonymous
-- visitors read published ones), and seeds the packages that previously lived
-- only as hardcoded frontend data — without ever creating duplicates.
--
-- Run AFTER supabase/schema.sql (or on its own: every statement is idempotent
-- and safe to re-run).
-- ============================================================================

-- 1. Base table (matches supabase/schema.sql so either file can run first).
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  region text not null,
  duration text not null,
  price_usd integer not null check (price_usd > 0),
  summary text not null,
  hero_image text not null,
  included jsonb not null default '[]'::jsonb,
  excluded jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 2. Columns consumed by the application model (src/admin/store.ts DbPackageRow).
--    "if not exists" keeps this safe on databases created by schema.sql.
alter table public.packages add column if not exists created_at timestamptz;
alter table public.packages add column if not exists nights integer not null default 0;
alter table public.packages add column if not exists discount integer;
alter table public.packages add column if not exists gallery jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists description text not null default '';
alter table public.packages add column if not exists signature text not null default '';
alter table public.packages add column if not exists highlights jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists availability jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists country jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists parks jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists wildlife jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists difficulty text;
alter table public.packages add column if not exists tags jsonb not null default '[]'::jsonb;
alter table public.packages add column if not exists featured boolean not null default false;
alter table public.packages add column if not exists archived boolean not null default false;
alter table public.packages add column if not exists coordinates jsonb;
alter table public.packages add column if not exists seo_title text;
alter table public.packages add column if not exists seo_description text;
alter table public.packages add column if not exists publish_date timestamptz;

-- `created_at` may have just been added above with no value on legacy rows:
-- backfill it from `updated_at` so ordering is deterministic, then tighten it.
update public.packages set created_at = updated_at where created_at is null;
alter table public.packages alter column created_at set default now();
alter table public.packages alter column created_at set not null;

-- 3. Keep updated_at honest on direct SQL edits (the CMS writes via the API).
create or replace function public.packages_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists packages_touch_updated_at on public.packages;
create trigger packages_touch_updated_at
  before update on public.packages
  for each row execute function public.packages_touch_updated_at();

-- 4. Row-level security.
--    Public visitors read published packages only; any authenticated staff
--    member (root · super_admin · content_manager · booking_manager ·
--    marketing_manager · finance) can read AND manage every package,
--    including drafts. `public.is_staff()` is (re)defined with canonical
--    role names by supabase/role_canonicalization.sql.
alter table public.packages enable row level security;

drop policy if exists "Public can read published packages" on public.packages;
drop policy if exists "Staff can read all packages" on public.packages;
drop policy if exists "Staff can manage packages" on public.packages;

create policy "Public can read published packages" on public.packages
  for select
  using (published = true or public.is_staff());

create policy "Staff can read all packages" on public.packages
  for select to authenticated
  using (public.is_staff());

create policy "Staff can manage packages" on public.packages
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 5. Realtime so the CMS and public site stay in sync without a refresh.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'packages'
  ) then
    alter publication supabase_realtime add table public.packages;
  end if;
end $$;

-- 6. Seed the packages that used to be hardcoded in src/data.ts. Each row is
--    keyed by slug and inserted only when that slug does not already exist, so
--    existing CMS records and edits are never overwritten and no duplicates
--    are created.
insert into public.packages (
  slug, title, region, duration, nights, price_usd, hero_image, gallery,
  summary, signature, included, excluded, availability, published, featured,
  coordinates, created_at, updated_at
)
values
(
  'great-migration', 'The Great Migration', 'Serengeti + Maasai Mara', '9 days / 8 nights', 8, 8450,
  'https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000',
  '["https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1400&w=2400","https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000"]'::jsonb,
  'Follow the herds from private mobile camps to the fabled Mara River crossings.',
  'River crossings, predator country, private mobile camp',
  '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water"]'::jsonb,
  '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb,
  '["Jun","Jul","Aug","Sep","Oct"]'::jsonb,
  true, true, '[35,42]'::jsonb, '2026-01-08T00:00:00Z', '2026-01-08T00:00:00Z'
),
(
  'big-five', 'Big Five, Unhurried', 'Ngorongoro + Serengeti', '7 days / 6 nights', 6, 6200,
  'https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000',
  '["https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/26052069/pexels-photo-26052069.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000"]'::jsonb,
  'A patient, private search for East Africa''s icons, led by the rhythms of the wild.',
  'Crater floor, lion territories, elephant herds',
  '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water"]'::jsonb,
  '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb,
  '["Jan","Feb","Jun","Jul","Aug","Sep"]'::jsonb,
  true, false, '[42,57]'::jsonb, '2026-01-07T00:00:00Z', '2026-01-07T00:00:00Z'
),
(
  'luxury-lodge', 'Lodges Beyond the Wild', 'Northern Tanzania', '8 days / 7 nights', 7, 9900,
  'https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000',
  '["https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000"]'::jsonb,
  'Architectural lodges, intuitive service and vast landscapes with every detail considered.',
  'Design lodges, bush dining, optional helicopter flight',
  '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water","Selected premium drinks and laundry"]'::jsonb,
  '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb,
  '["All year"]'::jsonb,
  true, false, '[56,52]'::jsonb, '2026-01-06T00:00:00Z', '2026-01-06T00:00:00Z'
),
(
  'family', 'The Family Bush', 'Laikipia + Maasai Mara', '8 days / 7 nights', 7, 5750,
  'https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000',
  '["https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000"]'::jsonb,
  'A flexible, deeply engaging journey designed for curious young explorers and their families.',
  'Junior ranger program, private house, gentle pacing',
  '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water","Private family vehicle throughout"]'::jsonb,
  '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb,
  '["Feb","Mar","Jun","Jul","Aug","Dec"]'::jsonb,
  true, false, '[62,32]'::jsonb, '2026-01-05T00:00:00Z', '2026-01-05T00:00:00Z'
),
(
  'honeymoon', 'Wildly, Together', 'Serengeti + Zanzibar', '11 days / 10 nights', 10, 11200,
  'https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000',
  '["https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1400&w=2400"]'::jsonb,
  'Private plains, lantern dinners and an Indian Ocean epilogue created for two.',
  'Private plunge pool, hot-air balloon, island retreat',
  '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water","Internal scheduled flights","Private celebration dinner"]'::jsonb,
  '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb,
  '["Jan","Feb","Jun","Jul","Aug","Sep","Oct"]'::jsonb,
  true, false, '[46,67]'::jsonb, '2026-01-04T00:00:00Z', '2026-01-04T00:00:00Z'
),
(
  'photographic', 'The Photographer''s Light', 'Ndutu + Serengeti', '10 days / 9 nights', 9, 9300,
  'https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000',
  '["https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000"]'::jsonb,
  'A specialist-led expedition with low-angle vehicles and time to wait for the frame.',
  'Pro guide, beanbags, editing suite, golden-hour drives',
  '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water","Photography vehicle with charging stations"]'::jsonb,
  '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities","Camera equipment"]'::jsonb,
  '["Jan","Feb","Mar","Jun","Sep","Oct"]'::jsonb,
  true, false, '[39,59]'::jsonb, '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z'
),
(
  'walking', 'On Foot in the Rift', 'Tarangire + Lake Eyasi', '6 days / 5 nights', 5, 4800,
  'https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000',
  '["https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=1600"]'::jsonb,
  'Read tracks, notice the small worlds and move through the landscape at nature''s pace.',
  'Private walking guide, fly camp, Hadzabe encounter',
  '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water","Armed walking ranger"]'::jsonb,
  '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb,
  '["Jun","Jul","Aug","Sep","Oct"]'::jsonb,
  true, false, '[52,62]'::jsonb, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z'
),
(
  'under-canvas', 'Under Canvas', 'Maasai Mara Conservancies', '5 days / 4 nights', 4, 3950,
  'https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000',
  '["https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000","https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000"]'::jsonb,
  'Canvas walls, hot bucket showers and the rare luxury of falling asleep to the wild.',
  'Private conservancy, night drives, fireside suppers',
  '["Private 4x4 Land Cruiser and expert guide","All park fees and conservancy levies","Full-board handpicked accommodation","Flying Doctor emergency evacuation cover","Airport transfers and purified water"]'::jsonb,
  '["International flights and visas","Travel insurance","Premium drinks and personal purchases","Guide gratuities"]'::jsonb,
  '["Jun","Jul","Aug","Sep","Oct","Nov"]'::jsonb,
  true, false, '[30,34]'::jsonb, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
)
on conflict (slug) do nothing;

-- ============================================================================
-- Verification
-- ============================================================================
-- Every seed slug should resolve to exactly one row:
--   select slug, count(*) from public.packages group by slug having count(*) > 1;
--
-- The CMS (authenticated staff) should see every row, including drafts:
--   select count(*) from public.packages;  -- ≥ 8
-- ============================================================================
