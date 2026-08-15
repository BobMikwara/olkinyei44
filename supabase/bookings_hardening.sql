-- Booking row hardening (role-independent): validation, trimming, indexes.
-- All role-based booking RLS lives in supabase/auth_schema_sync.sql using
-- canonical role names. This file is additive and idempotent.

create or replace function public.bookings_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.customer_name := left(btrim(new.customer_name), 120);
  new.customer_email := left(lower(btrim(new.customer_email)), 254);
  new.customer_phone := left(btrim(new.customer_phone), 32);
  new.safari := left(btrim(new.safari), 160);
  new.special_requests := left(coalesce(new.special_requests, ''), 4000);
  if new.adults < 1 then raise exception 'At least one adult is required'; end if;
  if new.children < 0 then raise exception 'Children cannot be negative'; end if;
  if new.start_date is null or new.end_date is null then raise exception 'Travel dates are required'; end if;
  if new.end_date < new.start_date then raise exception 'Departure cannot precede arrival'; end if;
  return new;
end;
$$;

drop trigger if exists bookings_validate_trigger on public.bookings;
create trigger bookings_validate_trigger
  before insert or update on public.bookings
  for each row execute function public.bookings_validate();

create index if not exists bookings_created_at_idx on public.bookings(created_at desc);
create index if not exists bookings_reference_idx on public.bookings(reference);
create index if not exists bookings_status_idx on public.bookings(status);
create index if not exists bookings_start_date_idx on public.bookings(start_date);
create index if not exists bookings_customer_email_idx on public.bookings(customer_email);
