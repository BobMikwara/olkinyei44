-- ============================================================================
-- ROLE CANONICALIZATION — single source of truth for roles
-- ============================================================================
-- Before: the database used root_super_admin / reservation_manager / marketing
-- / editor while the frontend used root / booking_manager / marketing_manager,
-- bridged by a translation table in src/admin/auth.ts. That mapping was lossy
-- (editor silently became content_manager) and duplicated the role model.
--
-- After: BOTH layers use exactly these six values, and the mapping layer is
-- deleted from the frontend.
--
--   root · super_admin · content_manager · booking_manager
--   marketing_manager · finance
--
-- Idempotent. Run AFTER auth_schema_sync.sql.
-- ============================================================================

-- 1. Drop the constraint so values can be rewritten.
alter table public.profiles drop constraint if exists profiles_role_check;

-- 2. Migrate every legacy value to its canonical equivalent.
update public.profiles set role = 'root'              where role in ('root_super_admin');
update public.profiles set role = 'booking_manager'   where role in ('reservation_manager', 'reservation', 'bookings');
update public.profiles set role = 'marketing_manager' where role in ('marketing');
update public.profiles set role = 'content_manager'   where role in ('editor', 'admin');

-- Anything unrecognised becomes the least-privileged content role.
update public.profiles
set role = 'content_manager'
where role is null
   or role not in ('root', 'super_admin', 'content_manager', 'booking_manager', 'marketing_manager', 'finance');

-- 3. Re-apply the constraint with the canonical set only.
alter table public.profiles alter column role set default 'content_manager';
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('root', 'super_admin', 'content_manager', 'booking_manager', 'marketing_manager', 'finance'));

-- 4. Rebuild every predicate against canonical names.
create or replace function public.is_root_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and status = 'active' and (is_root = true or role = 'root')
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
    where id = auth.uid() and status = 'active'
      and (is_root = true or role in ('root', 'super_admin'))
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
    where id = auth.uid() and status = 'active'
      and (is_root = true or role in ('root', 'super_admin', 'booking_manager'))
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
        or role in ('root', 'super_admin', 'content_manager', 'booking_manager', 'marketing_manager', 'finance')
      )
  );
$$;

-- 5. Root-protection triggers must test the canonical value.
create or replace function public.protect_root_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_root = true or old.role = 'root' then
    if public.is_root_service() then
      return new;
    end if;
    raise exception 'The Root Super Admin cannot be modified';
  end if;

  if (new.role = 'root' or new.is_root = true) and not public.is_root_service() then
    raise exception 'The Root Super Admin cannot be created from the client';
  end if;

  return new;
end;
$$;

create or replace function public.protect_root_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.is_root = true or old.role = 'root') and not public.is_root_service() then
    raise exception 'The Root Super Admin cannot be deleted';
  end if;
  return old;
end;
$$;

-- 6. Verification — must return zero rows.
--   select email, role from public.profiles
--   where role not in ('root','super_admin','content_manager','booking_manager','marketing_manager','finance');
