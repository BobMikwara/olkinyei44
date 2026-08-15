-- ============================================================================
-- TESTIMONIALS — ratings, safari attribution, multi-source review support
-- ============================================================================
-- EXTENDS public.testimonials (created in schema.sql, moderation added in
-- testimonials_moderation.sql). Nothing is dropped, no row is deleted.
--
-- Adds:
--   * rating (1-5)
--   * safari_package attribution
--   * consent record for public display
--   * provider fields so Tripadvisor / SafariBookings reviews can be imported
--     later through an authorised API without another schema change
--
-- Idempotent: safe to run repeatedly. Run AFTER testimonials_moderation.sql.
-- ============================================================================

-- 1. Guest-facing fields.
alter table public.testimonials add column if not exists rating smallint;
alter table public.testimonials add column if not exists safari_package text;
alter table public.testimonials add column if not exists consent_given boolean not null default false;

alter table public.testimonials drop constraint if exists testimonials_rating_check;
alter table public.testimonials
  add constraint testimonials_rating_check
  check (rating is null or (rating >= 1 and rating <= 5));

-- 2. Review provider fields.
--    `source` already exists from testimonials_moderation.sql with values
--    'public' | 'cms'. Those are migrated to the provider vocabulary below so
--    there is ONE source column, not two competing ones.
alter table public.testimonials add column if not exists external_review_id text;
alter table public.testimonials add column if not exists external_url text;
alter table public.testimonials add column if not exists external_rating numeric(3,1);
alter table public.testimonials add column if not exists external_created_at timestamptz;
alter table public.testimonials add column if not exists imported_at timestamptz;
alter table public.testimonials add column if not exists last_synced_at timestamptz;

-- Migrate the earlier submission-origin values onto the provider vocabulary.
update public.testimonials set source = 'website' where source in ('public', 'cms');
update public.testimonials set source = 'website' where source is null;

alter table public.testimonials alter column source set default 'website';

alter table public.testimonials drop constraint if exists testimonials_source_check;
alter table public.testimonials
  add constraint testimonials_source_check
  check (source in ('website', 'tripadvisor', 'safaribookings', 'other'));

-- 3. Duplicate protection for imported reviews.
--    A provider's review id is unique per provider. Website submissions have a
--    null external id and are unaffected by this constraint.
create unique index if not exists testimonials_source_external_id_key
  on public.testimonials (source, external_review_id)
  where external_review_id is not null;

create index if not exists testimonials_source_idx on public.testimonials(source);
create index if not exists testimonials_rating_idx on public.testimonials(rating);

-- 4. Keep the validation trigger aware of the new columns. This REPLACES the
--    function body from testimonials_moderation.sql; the trigger itself is
--    unchanged and still enforces published = (status = 'approved').
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

-- 5. Screening applies to website submissions. Imported provider reviews are
--    published verbatim once a moderator approves them; we must not silently
--    rewrite a third party's words.
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

-- 6. RLS: the public insert policy must accept the new guest fields while
--    still refusing self-publication and refusing forged provider reviews.
drop policy if exists "Anyone can submit a testimonial" on public.testimonials;

create policy "Anyone can submit a testimonial" on public.testimonials
  for insert to anon, authenticated
  with check (
    source = 'website'
    and external_review_id is null   -- visitors cannot forge imported reviews
    and status = 'pending'
    and published = false
    and flagged = false
    and consent_given = true         -- explicit permission to display
    and (rating is null or (rating >= 1 and rating <= 5))
    and char_length(quote) between 10 and 4000
    and char_length(guest_name) between 2 and 120
  );

-- Provider imports run server-side with the service role, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Verification:
--   select source, status, count(*) from public.testimonials group by 1,2;
--   set role anon; select guest_name, rating, source from public.testimonials; reset role;
--   -- anon must see approved rows only
-- ---------------------------------------------------------------------------
