-- Diagnostic queries for authentication troubleshooting.
-- Run ONE block at a time in the SQL Editor; each is a harmless read.

-- 1. Verify every profile has a canonical role/status and the Root row exists.
select id, email, role, status, is_root, invited_by, created_at, last_login_at
from public.profiles
order by is_root desc, created_at;

-- Expected: exactly one is_root = true row with role = root_super_admin,
-- status = active. Any other role values here mean auth_schema_sync.sql
-- needs to be (re)run.

-- 2. For a specific user, show the auth user + profile side by side.
-- Replace both placeholders with the failing account's email.
-- select au.id as auth_id, au.email, au.last_sign_in_at,
--        p.role, p.status, p.is_root, p.last_login_at
-- from auth.users au
-- left join public.profiles p on p.id = au.id
-- where au.email = 'someone@example.com';
--
-- Profile must exist with the same id. status must be 'active'.

-- 3. Inspect effective RLS on profiles (should match auth_schema_sync.sql).
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('profiles', 'bookings', 'audit_logs', 'cms_content')
order by tablename, cmd, policyname;

-- 4. Triggers on profiles (root protection must be present).
select tgname, tgrelid::regclass, proname
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.profiles'::regclass
order by tgname;

-- 5. Confirm realtime includes content tables the app publishes to.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- 6. Role invariants — must return zero rows.
select email, role, status from public.profiles
where role not in ('root_super_admin','super_admin','content_manager','editor','reservation_manager','marketing','finance')
   or status not in ('active','pending','suspended','deleted');

-- 7. Root invariants — must return exactly ONE row.
select count(*) as root_count
from public.profiles
where is_root = true or role = 'root_super_admin';

-- 8. Recent auth audit events for a user.
-- Replace email first, then:
-- select created_at, action, outcome, reason
-- from public.audit_logs
-- where new_value::text like '%someone@example.com%'
--    or target_id in (select id from public.profiles where email = 'someone@example.com')
-- order by created_at desc limit 25;
