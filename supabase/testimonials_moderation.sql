-- ============================================================================
-- TESTIMONIALS — public submission + staff moderation
-- ============================================================================
-- EXTENDS the existing public.testimonials table from schema.sql.
-- No table is dropped, no row is deleted, no existing column is removed.
--
-- Existing columns kept as-is:
--   id · quote · guest_name · guest_location · published · sort_order
--
-- Idempotent: safe to run repeatedly.
-- ============================================================================

-- 1. Add moderation columns alongside the existing ones.
alter table public.testimonials add column if not exists guest_email text;
alter table public.testimonials add column if not exists guest_photo text;
alter table public.testimonials add column if not exists status text;
alter table public.testimonials add column if not exists flagged boolean not null default false;
alter table public.testimonials add column if not exists flag_reason text;
alter table public.testimonials add column if not exists moderated_by uuid;
alter table public.testimonials add column if not exists moderated_at timestamptz;
alter table public.testimonials add column if not exists staff_notes text;
alter table public.testimonials add column if not exists source text not null default 'cms';
alter table public.testimonials add column if not exists submitted_ip text;
alter table public.testimonials add column if not exists created_at timestamptz not null default now();
alter table public.testimonials add column if not exists updated_at timestamptz not null default now();

-- 2. Backfill status from the pre-existing `published` flag so nothing that is
--    live today disappears: published = true becomes 'approved'.
update public.testimonials set status = 'approved' where status is null and published = true;
update public.testimonials set status = 'pending'  where status is null;

alter table public.testimonials alter column status set default 'pending';
alter table public.testimonials alter column status set not null;

alter table public.testimonials drop constraint if exists testimonials_status_check;
alter table public.testimonials
  add constraint testimonials_status_check
  check (status in ('pending', 'approved', 'rejected', 'flagged'));

-- 3. Keep `published` and `status` consistent in both directions. Legacy
--    queries that read `published` continue to work unchanged.
create or replace function public.testimonials_sync_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();

  -- Trim and bound free text.
  new.guest_name     := left(btrim(coalesce(new.guest_name, '')), 120);
  new.guest_location := left(btrim(coalesce(new.guest_location, '')), 120);
  new.quote          := left(btrim(coalesce(new.quote, '')), 4000);
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

-- 4. Server-side profanity screening. Submissions containing flagged terms are
--    held as 'flagged' for human review; they are never auto-published.
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
  -- Only screen public submissions on insert. Staff edits are trusted.
  if tg_op = 'INSERT' and new.source = 'public' then
    foreach term in array banned loop
      if position(term in haystack) > 0 then
        new.status := 'flagged';
        new.flagged := true;
        new.flag_reason := 'Automatic language screening matched a blocked term';
        new.published := false;
        return new;
      end if;
    end loop;

    -- Link spam heuristic.
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

-- 5. Indexes for the moderation queue.
create index if not exists testimonials_status_idx on public.testimonials(status);
create index if not exists testimonials_created_at_idx on public.testimonials(created_at desc);
create index if not exists testimonials_published_idx on public.testimonials(published) where published = true;

-- 6. Row Level Security.
alter table public.testimonials enable row level security;

drop policy if exists "Public can read published testimonials" on public.testimonials;
drop policy if exists "Staff can manage testimonials" on public.testimonials;
drop policy if exists "Anyone can read approved testimonials" on public.testimonials;
drop policy if exists "Anyone can submit a testimonial" on public.testimonials;
drop policy if exists "Staff can read every testimonial" on public.testimonials;
drop policy if exists "Staff can moderate testimonials" on public.testimonials;

-- Visitors read ONLY approved entries. No helper function is called here: if
-- public.is_staff() were referenced and missing, the whole SELECT would fail
-- for anonymous users. Permissive policies are OR-ed, so staff still see all
-- rows through the second policy.
create policy "Anyone can read approved testimonials" on public.testimonials
  for select
  using (status = 'approved');

create policy "Staff can read every testimonial" on public.testimonials
  for select to authenticated
  using (public.is_staff());

-- Visitors may submit, but may never choose their own status or publish state.
-- The screening trigger runs after this check and can downgrade to 'flagged'.
create policy "Anyone can submit a testimonial" on public.testimonials
  for insert to anon, authenticated
  with check (
    source = 'public'
    and status = 'pending'
    and published = false
    and flagged = false
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

-- 7. Realtime so the moderation queue updates live.
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
-- Verification:
--   select status, count(*) from public.testimonials group by status;
--   set role anon; select guest_name, quote from public.testimonials; reset role;
--   -- anon must see approved rows only
-- ---------------------------------------------------------------------------
