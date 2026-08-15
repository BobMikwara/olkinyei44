-- ============================================================================
-- AUTHORITATIVE AUTH SYNC — profiles, roles, RLS, audit
-- ============================================================================
-- This file is the single source of truth for the authentication schema.
-- It is idempotent: safe to run repeatedly. Run it AFTER schema.sql and
-- INSTEAD OF production_auth.sql and bookings_hardening.sql (both superseded
-- by this file's role handling), or run it on top of them — legacy role
-- values are migrated to canonical names below.
--
-- Canonical role names used by EVERY layer of the application:
--   root_super_admin · super_admin · content_manager · editor
--   reservation_manager · marketing · finance
--
-- Canonical statuses: active · pending · suspended · deleted
--
-- profiles columns consumed by the frontend (src/admin/auth.ts):
--   id · email · full_name · role · status · avatar_url · invited_by
--   is_root · created_at · updated_at · last_login_at
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============ 1. Align profiles columns with the application ============

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists status text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists invited_by uuid;
alter table public.profiles add column if not exists is_root boolean not null default false;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists last_login_at timestamptz;

create unique index if not exists profiles_email_key on public.profiles (lower(email)) where email is not null;

-- ============ 2. Normalise every legacy role value to canonical names ============
-- Order matters: run the mapping BEFORE tightening the CHECK constraint.

update public.profiles set role = 'root_super_admin'     where role in ('root');
update public.profiles set role = 'super_admin'          where role in ('admin');
update public.profiles set role = 'reservation_manager'  where role in ('booking_manager', 'reservation', 'bookings');
update public.profiles set role = 'marketing'            where role in ('marketing_manager');
update public.profiles set role = 'content_manager'      where role not in (
  'root_super_admin', 'super_admin', 'content_manager', 'editor',
  'reservation_manager', 'marketing', 'finance'
) or role is null;

-- Protect historical root flags: any row previously created as root keeps it.
update public.profiles set is_root = true, role = 'root_super_admin'
  where role = 'root_super_admin';

-- Default status for existing rows.
update public.profiles set status = 'active' where status is null;

alter table public.profiles alter column role set default 'content_manager';
alter table public.profiles alter column status set default 'pending';

alter table public.profiles
  drop constraint if exists profiles_role_check,
  drop constraint if exists profiles_status_check,
  drop constraint if exists profiles_role_check2;

alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'root_super_admin', 'super_admin', 'content_manager', 'editor',
    'reservation_manager', 'marketing', 'finance'
  )),
  add constraint profiles_status_check
  check (status in ('active', 'pending', 'suspended', 'deleted'));

-- ============ 3. Staff predicates (canonical names everywhere) ============

create or replace function public.is_root_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and (is_root = true or role = 'root_super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and (is_root = true or role in ('root_super_admin', 'super_admin'))
  );
$$;

create or replace function public.is_booking_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and (is_root = true or role in ('root_super_admin', 'super_admin', 'reservation_manager'))
  );
$$;

-- General staff check retained for content tables referenced by schema.sql.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and (
        is_root = true
        or role in (
          'root_super_admin', 'super_admin', 'content_manager', 'editor',
          'reservation_manager', 'marketing', 'finance'
        )
      )
  );
$$;

create or replace function public.is_root_service()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'service_role'
  ) = 'service_role';
$$;

-- ============ 4. Root-profile guardrails ============

create or replace function public.protect_root_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Root rows are immutable through the client: no demotion, no un-rooting,
  -- no suspension, no deletion, no id change. The service role bypasses.
  if old.is_root = true or old.role = 'root_super_admin' then
    if public.is_root_service() then
      return new;
    end if;
    raise exception 'The Root Super Admin cannot be modified';
  end if;

  -- Client code can never grant the root role or root flag.
  if (new.role = 'root_super_admin' or new.is_root = true) and not public.is_root_service() then
    raise exception 'The Root Super Admin cannot be created from the client';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_root_profile_trigger on public.profiles;
create trigger protect_root_profile_trigger
  before update on public.profiles
  for each row execute function public.protect_root_profile();

create or replace function public.protect_root_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.is_root = true or old.role = 'root_super_admin') and not public.is_root_service() then
    raise exception 'The Root Super Admin cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_root_delete_trigger on public.profiles;
create trigger protect_root_delete_trigger
  before delete on public.profiles
  for each row execute function public.protect_root_delete();

-- Keep updated_at honest for any direct SQL write.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============ 5. Profiles RLS (least privilege) ============

alter table public.profiles enable row level security;

drop policy if exists "Staff can read profiles" on public.profiles;
drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Privileged staff can read all profiles" on public.profiles;
drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_select_privileged on public.profiles;

create policy "Users can read their own profile" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "Privileged staff can read all profiles" on public.profiles
  for select to authenticated
  using (public.is_super_admin());

-- All profile writes flow through the service role (the /api/invite-user and
-- /api/manage-user Vercel functions). Clients have no write path at all.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ============ 6. Central audit log ============

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  target text not null,
  target_id text,
  outcome text not null default 'success' check (outcome in ('success', 'failure')),
  reason text,
  old_value jsonb,
  new_value jsonb,
  ip_address inet,
  browser text,
  device text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_user_id_idx on public.audit_logs(user_id);
create index if not exists audit_logs_target_idx on public.audit_logs(target, target_id);

alter table public.audit_logs enable row level security;

drop policy if exists "Anyone authenticated can append audit" on public.audit_logs;
drop policy if exists "Only privileged staff can read audit" on public.audit_logs;
drop policy if exists audit_logs_insert on public.audit_logs;
drop policy if exists audit_logs_select_privileged on public.audit_logs;

create policy "Anyone authenticated can append audit" on public.audit_logs
  for insert to authenticated
  with check (true);

create policy "Only privileged staff can read audit" on public.audit_logs
  for select to authenticated
  using (public.is_super_admin());

grant all on public.audit_logs to service_role;

-- ============ 7. Bookings RLS aligned with canonical roles ============

drop policy if exists "Booking staff can read bookings" on public.bookings;
drop policy if exists "Booking staff can update bookings" on public.bookings;
drop policy if exists "Only root can delete bookings" on public.bookings;
drop policy if exists "Staff can read bookings" on public.bookings;
drop policy if exists "Staff can update bookings" on public.bookings;

create policy "Public can create booking requests" on public.bookings
  for insert to anon, authenticated
  with check (
    status = 'New'
    and adults > 0
    and children >= 0
    and start_date <= end_date
    and char_length(customer_email) <= 254
    and char_length(customer_name) > 0
    and char_length(reference) > 0
  );

create policy "Booking staff can read bookings" on public.bookings
  for select to authenticated
  using (public.is_booking_staff());

create policy "Booking staff can update bookings" on public.bookings
  for update to authenticated
  using (public.is_booking_staff())
  with check (public.is_booking_staff());

create policy "Only root can delete bookings" on public.bookings
  for delete to authenticated
  using (public.is_root_admin());

-- ============================================================================
-- POST-RUN STEP (one time, for the first Root account):
--
--   insert into public.profiles (id, email, full_name, role, status, is_root)
--   values (
--     '<auth-user-uuid>',
--     'root@example.com',
--     'Root Super Admin',
--     'root_super_admin',
--     'active',
--     true
--   )
--   on conflict (id) do update
--     set role = 'root_super_admin', is_root = true, status = 'active';
--
-- CREATE TABLE STEP complete. Authentication reconciled.
-- ============================================================================
