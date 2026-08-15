create extension if not exists "pgcrypto";

-- NOTE: supabase/auth_schema_sync.sql is the authoritative auth schema and
-- normalises every role value to the canonical names. Run it after this file.
-- The baseline check below already uses canonical names.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'content_manager' check (role in (
    'root_super_admin', 'super_admin', 'content_manager', 'editor',
    'reservation_manager', 'marketing', 'finance'
  )),
  status text not null default 'pending' check (status in ('active', 'pending', 'suspended', 'deleted')),
  avatar_url text,
  invited_by uuid,
  is_root boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index if not exists profiles_email_key
  on public.profiles (lower(email)) where email is not null;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  created_at timestamptz not null default now(),
  status text not null default 'New' check (status in ('New', 'Confirmed', 'In planning', 'Cancelled')),
  safari text not null,
  start_date date not null,
  end_date date not null,
  adults integer not null check (adults > 0),
  children integer not null default 0 check (children >= 0),
  accommodation text not null,
  pickup text not null,
  airport text not null,
  budget text not null,
  special_requests text not null default '',
  payment_preference text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null
);

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

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  capacity integer not null check (capacity >= 0),
  price_override_usd integer,
  unique(package_id, start_date, end_date)
);

create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  alt_text text not null,
  category text not null,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null,
  guest_name text not null,
  guest_location text,
  published boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null,
  body jsonb not null default '{}'::jsonb,
  category text not null check (category in ('Wildlife', 'Travel', 'Visa', 'Packing', 'Photography')),
  hero_image text not null,
  seo_title text,
  seo_description text,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.guides (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  speciality text not null,
  bio text not null,
  portrait_url text not null,
  active boolean not null default true
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  fleet_code text not null unique,
  model text not null,
  base text not null,
  status text not null check (status in ('Ready', 'In field', 'Service due', 'Unavailable'))
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  invoice_number text not null unique,
  amount_usd numeric(12,2) not null check (amount_usd >= 0),
  status text not null check (status in ('Draft', 'Sent', 'Paid', 'Void')),
  issued_at timestamptz not null default now(),
  due_at timestamptz
);

create index if not exists bookings_created_at_idx on public.bookings(created_at desc);
create index if not exists bookings_customer_email_idx on public.bookings(lower(customer_email));
create index if not exists availability_dates_idx on public.availability(start_date, end_date);
create index if not exists blog_published_at_idx on public.blog_posts(published_at desc);

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

alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.packages enable row level security;
alter table public.availability enable row level security;
alter table public.gallery enable row level security;
alter table public.testimonials enable row level security;
alter table public.blog_posts enable row level security;
alter table public.guides enable row level security;
alter table public.vehicles enable row level security;
alter table public.invoices enable row level security;

create policy "Public can create booking requests" on public.bookings for insert to anon, authenticated with check (
  status = 'New'
  and adults > 0
  and children >= 0
  and start_date <= end_date
  and char_length(customer_email) <= 254
  and char_length(customer_name) > 0
  and char_length(reference) > 0
);
create policy "Staff can read bookings" on public.bookings for select to authenticated using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and (is_root = true or role in ('root_super_admin', 'super_admin', 'reservation_manager'))
  )
);
create policy "Staff can update bookings" on public.bookings for update to authenticated using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and (is_root = true or role in ('root_super_admin', 'super_admin', 'reservation_manager'))
  )
) with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and (is_root = true or role in ('root_super_admin', 'super_admin', 'reservation_manager'))
  )
);
create policy "Only root can delete bookings" on public.bookings for delete to authenticated using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and (is_root = true or role = 'root_super_admin')
  )
);
create policy "Public can read published packages" on public.packages for select using (published = true or public.is_staff());
create policy "Staff can manage packages" on public.packages for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Public can read availability" on public.availability for select using (true);
create policy "Staff can manage availability" on public.availability for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Public can read published gallery" on public.gallery for select using (published = true or public.is_staff());
create policy "Staff can manage gallery" on public.gallery for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Public can read published testimonials" on public.testimonials for select using (published = true or public.is_staff());
create policy "Staff can manage testimonials" on public.testimonials for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Public can read published posts" on public.blog_posts for select using (published_at <= now() or public.is_staff());
create policy "Staff can manage posts" on public.blog_posts for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Public can read active guides" on public.guides for select using (active = true or public.is_staff());
create policy "Staff can manage guides" on public.guides for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage vehicles" on public.vehicles for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Staff can manage invoices" on public.invoices for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Staff can read profiles" on public.profiles for select to authenticated using (public.is_staff() or id = auth.uid());

insert into storage.buckets (id, name, public)
values ('expedition-media', 'expedition-media', true)
on conflict (id) do nothing;

create policy "Public expedition media" on storage.objects for select using (bucket_id = 'expedition-media');
create policy "Staff upload expedition media" on storage.objects for insert to authenticated with check (bucket_id = 'expedition-media' and public.is_staff());
create policy "Staff update expedition media" on storage.objects for update to authenticated using (bucket_id = 'expedition-media' and public.is_staff());
create policy "Staff delete expedition media" on storage.objects for delete to authenticated using (bucket_id = 'expedition-media' and public.is_staff());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;