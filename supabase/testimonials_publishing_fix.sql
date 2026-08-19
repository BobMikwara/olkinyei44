-- ============================================================================
-- TESTIMONIALS — PUBLISHING FIX (single, idempotent source of truth)
-- ============================================================================
-- Root cause: the public website filters testimonials by `status = 'approved'`,
-- but the baseline `schema.sql` table only carries a legacy `published` boolean
-- and installs a `published = true` SELECT policy. When the baseline schema is
-- live without the testimonials moderation migrations, the `status` column and
-- the `status = 'approved'` read policy do not exist, so CMS-published
-- testimonials never match the frontend filter and never appear publicly.
--
-- This file aligns the EXISTING `public.testimonials` table with what the
-- application writes and reads. It:
--   1. adds every column the app uses (idempotent `if not exists`),
--   2. backfills `status` from the legacy `published` flag,
--   3. keeps `published` and `status` in lock-step via a trigger,
--   4. installs the corrected RLS: ONLY approved testimonials are publicly
--      readable; staff (public.is_staff()) can read and moderate everything;
--      visitors can submit but can never self-publish or set a status,
--   5. grants the right table privileges and enables Realtime.
--
-- It never creates a second table, never drops data, and is safe to run
-- repeatedly — including on a database that already ran
-- testimonials_moderation.sql and testimonials_sources.sql (it supersedes
-- both). Run it after supabase/schema.sql.
-- ============================================================================

-- 1. Columns the application model reads/writes. `published` and `sort_order`
--    exist in schema.sql; the rest are added idempotently.
alter table public.testimonials add column if not exists published boolean not null default true;
alter table public.testimonials add column if not exists sort_order integer not null default 0;
alter table public.testimonials add column if not exists guest_email text;
alter table public.testimonials add column if not exists guest_photo text;
alter table public.testimonials add column if not exists rating smallint;
alter table public.testimonials add column if not exists safari_package text;
alter table public.testimonials add column if not exists consent_given boolean not null default false;
alter table public.testimonials add column if not exists status text;
alter table public.testimonials add column if not exists flagged boolean not null default false;
alter table public.testimonials add column if not exists flag_reason text;
alter table public.testimonials add column if not exists staff_notes text;
alter table public.testimonials add column if not exists moderated_by uuid;
alter table public.testimonials add column if not exists moderated_at timestamptz;
alter table public.testimonials add column if not exists source text not null default 'website';
alter table public.testimonials add column if not exists external_review_id text;
alter table public.testimonials add column if not exists external_url text;
alter table public.testimonials add column if not exists external_rating numeric(3,1);
alter table public.testimonials add column if not exists external_created_at timestamptz;
alter table public.testimonials add column if not exists imported_at timestamptz;
alter table public.testimonials add column if not exists last_synced_at timestamptz;
alter table public.testimonials add column if not exists created_at timestamptz not null default now();
alter table public.testimonials add column if not exists updated_at timestamptz not null default now();

-- 2. Backfill `status` from the legacy `published` flag so nothing that is
--    live today disappears: published = true becomes 'approved'.
update public.testimonials set status = 'approved' where status is null and published = true;
update public.testimonials set status = 'pending'  where status is null;

alter table public.testimonials alter column status set default 'pending';
alter table public.testimonials alter column status set not null;

-- Normalise `source` onto the provider vocabulary ('website' | 'tripadvisor' |
-- 'safaribookings' | 'other'). The earliest moderation migration used
-- 'public'/'cms'; rows written then must be migrated before the CHECK below.
update public.testimonials set source = 'website' where source in ('public', 'cms') or source is null;

-- 3. Keep `published` and `status` consistent in both directions. Legacy
--    readers that query `published = true` continue to work unchanged.
create or replace function public.testimonials_sync_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();

  new.guest_name     := left(btrim(coalesce(new.guest_name, '')), 120);
  new.guest_location := left(btrim(coalesce(new.guest_location, '')), 120);
  new.quote          := left(btrim(coalesce(new.quote, '')), 4000);
  new.safari_package := nullif(left(btrim(coalesce(new.safari_package, '')), 160), '');
  new.guest_email    := nullif(left(lower(btrim(coalesce(new.guest_email, ''))), 254), '');

  if length(new.quote) < 10 then
    raise exception 'A testimonial must be at least 10 characters long';
  end if;
  if length(new.guest_name) < 2 then
    raise exception 'A name is required';
  end if;

  -- Only approved testimonials are ever published.
  new.published := (new.status = 'approved');

  return new;
end;
$$;

drop trigger if exists testimonials_sync_status_trigger on public.testimonials;
create trigger testimonials_sync_status_trigger
  before insert or update on public.testimonials
  for each row execute function public.testimonials_sync_status();

-- 4. Server-side profanity/link screening for public submissions. Imported
--    provider reviews are published verbatim once approved, so they are not
--    rewritten by this trigger.
create or replace function public.testimonials_screen_language()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  banned text[] := array[
    'fuck','shit','bitch','asshole','bastard','cunt','dick','piss','slut','whore',
    'nigger','faggot','retard','rape','kill yourself','scam','fraud','viagra','casino'
  ];
  term text;
  haystack text := lower(coalesce(new.quote, '') || ' ' || coalesce(new.guest_name, ''));
begin
  if tg_op = 'INSERT' and new.source = 'website' and new.external_review_id is null then
    foreach term in array banned loop
      if position(term in haystack) > 0 then
        new.status := 'flagged';
        new.flagged := true;
        new.flag_reason := 'Automatic language screening matched a blocked term';
        new.published := false;
        return new;
      end if;
    end loop;

    if haystack like '%http://%' or haystack like '%https://%' or haystack like '%www.%' then
      new.status := 'flagged';
      new.flagged := true;
      new.flag_reason := 'Automatic screening detected a link';
      new.published := false;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists testimonials_screen_language_trigger on public.testimonials;
create trigger testimonials_screen_language_trigger
  before insert on public.testimonials
  for each row execute function public.testimonials_screen_language();

-- 5. Value domains + duplicate protection for imported reviews.
alter table public.testimonials drop constraint if exists testimonials_status_check;
alter table public.testimonials
  add constraint testimonials_status_check
  check (status in ('pending', 'approved', 'rejected', 'flagged'));

alter table public.testimonials drop constraint if exists testimonials_source_check;
alter table public.testimonials
  add constraint testimonials_source_check
  check (source in ('website', 'tripadvisor', 'safaribookings', 'other'));

alter table public.testimonials drop constraint if exists testimonials_rating_check;
alter table public.testimonials
  add constraint testimonials_rating_check
  check (rating is null or (rating >= 1 and rating <= 5));

create unique index if not exists testimonials_source_external_id_key
  on public.testimonials (source, external_review_id)
  where external_review_id is not null;

create index if not exists testimonials_status_idx on public.testimonials(status);
create index if not exists testimonials_created_at_idx on public.testimonials(created_at desc);

-- 6. Row Level Security — the corrected read policy. Anonymous visitors can
--    SELECT ONLY approved testimonials; everything else stays private.
--    Permissive policies are OR-ed, so staff still see every row through the
--    dedicated staff policy below.
alter table public.testimonials enable row level security;

drop policy if exists "Public can read published testimonials" on public.testimonials;
drop policy if exists "Staff can manage testimonials" on public.testimonials;
drop policy if exists "Anyone can read approved testimonials" on public.testimonials;
drop policy if exists "Anyone can submit a testimonial" on public.testimonials;
drop policy if exists "Staff can read every testimonial" on public.testimonials;
drop policy if exists "Staff can moderate testimonials" on public.testimonials;
drop policy if exists "Staff can delete testimonials" on public.testimonials;
drop policy if exists "Staff can create testimonials" on public.testimonials;

-- ONLY approved testimonials are publicly readable.
create policy "Anyone can read approved testimonials" on public.testimonials
  for select
  using (status = 'approved');

create policy "Staff can read every testimonial" on public.testimonials
  for select to authenticated
  using (public.is_staff());

-- Visitors may submit, but may never choose their own status or publish state.
create policy "Anyone can submit a testimonial" on public.testimonials
  for insert to anon, authenticated
  with check (
    source = 'website'
    and external_review_id is null
    and status = 'pending'
    and published = false
    and flagged = false
    and consent_given = true
    and (rating is null or (rating >= 1 and rating <= 5))
    and char_length(quote) between 10 and 4000
    and char_length(guest_name) between 2 and 120
  );

-- Only staff can change status, edit, or remove.
create policy "Staff can moderate testimonials" on public.testimonials
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "Staff can delete testimonials" on public.testimonials
  for delete to authenticated
  using (public.is_staff());

create policy "Staff can create testimonials" on public.testimonials
  for insert to authenticated
  with check (public.is_staff());

grant select, insert on public.testimonials to anon;
grant select, insert, update, delete on public.testimonials to authenticated;

-- 7. Realtime so the moderation queue and the public section update live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'testimonials'
  ) then
    alter publication supabase_realtime add table public.testimonials;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Verification (run after the migration):
--   select status, count(*) from public.testimonials group by status;
--   -- Anonymous view (must list only approved rows):
--   set role anon; select guest_name, status from public.testimonials; reset role;
-- ---------------------------------------------------------------------------
