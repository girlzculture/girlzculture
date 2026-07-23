-- Girlz Culture canonical application-schema baseline.
--
-- The original prototype was built against these eleven tables in a manually
-- provisioned Supabase project. Later repository migrations evolve this
-- schema, so a fresh branch must create the original prerequisites first.
--
-- Production safety:
--   * all definitions are additive (CREATE ... IF NOT EXISTS);
--   * this migration never drops, truncates, deletes, updates, or reseeds data;
--   * existing production tables and rows are left untouched.

begin;

create table if not exists public.salons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  description text,
  phone text,
  email text,
  address_street text,
  address_city text,
  address_state text,
  address_zip text,
  neighborhood text,
  latitude numeric,
  longitude numeric,
  hours jsonb not null default '{}'::jsonb,
  cover_photo_url text,
  gallery_photos jsonb not null default '[]'::jsonb,
  status text not null default 'New',
  verification_status text not null default 'Pending',
  subscription_tier text not null default 'Free-seed',
  stripe_account_id text,
  badges jsonb not null default '[]'::jsonb,
  rating_overall numeric not null default 0,
  review_count integer not null default 0,
  capacity integer not null default 1,
  languages text[] not null default '{}'::text[],
  date_joined timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);

create table if not exists public.stylists (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null,
  specialties jsonb not null default '[]'::jsonb,
  bio text,
  photos jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.styles (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null,
  category text,
  description text,
  duration_min_hours numeric,
  duration_max_hours numeric,
  base_price numeric not null default 0,
  size_options jsonb not null default '[]'::jsonb,
  length_options jsonb not null default '[]'::jsonb,
  addons jsonb not null default '[]'::jsonb,
  hair_included boolean not null default false,
  photos jsonb not null default '[]'::jsonb,
  price_display_min numeric,
  price_display_max numeric,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.style_materials (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.styles(id) on delete cascade,
  name text not null,
  price numeric not null default 0,
  longevity text,
  quality_note text,
  is_bring_your_own boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  saved_salons jsonb not null default '[]'::jsonb,
  reliability_status text not null default 'Good',
  no_show_count integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  salon_id uuid not null references public.salons(id) on delete cascade,
  stylist_id uuid references public.stylists(id) on delete set null,
  style_id uuid not null references public.styles(id) on delete restrict,
  selected_size text,
  selected_length text,
  selected_material_id uuid references public.style_materials(id) on delete set null,
  selected_addons jsonb not null default '[]'::jsonb,
  appointment_datetime timestamp without time zone not null,
  duration_hours numeric not null,
  estimated_total numeric not null,
  deposit_amount numeric not null,
  deposit_status text not null default 'Pending',
  balance_due numeric not null,
  confirmation_code text unique,
  status text not null default 'Requested',
  stripe_payment_id text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  stylist_id uuid references public.stylists(id) on delete set null,
  rating_overall integer not null,
  rating_price_accuracy integer,
  rating_punctuality integer,
  rating_quality integer,
  rating_cleanliness integer,
  would_return boolean,
  written_review text,
  result_photos jsonb not null default '[]'::jsonb,
  salon_reply text,
  dispute_status text not null default 'None',
  created_at timestamp with time zone not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  tier text not null default 'Free-seed',
  status text not null default 'Free-seed',
  billing_start date,
  stripe_subscription_id text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  stylist_id uuid references public.stylists(id) on delete cascade,
  day_of_week text,
  start_time time without time zone,
  end_time time without time zone,
  is_blocked boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null default 'Admin',
  created_at timestamp with time zone not null default now()
);

create table if not exists public.complaints_log (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  type text not null,
  description text,
  status text not null default 'Logged',
  created_at timestamp with time zone not null default now()
);

comment on table public.salons is 'Partner salon profiles; canonical Girlz Culture marketplace object.';
comment on table public.bookings is 'Customer appointments linking salons, services, stylists, and deposits.';
comment on table public.reviews is 'Verified appointment reviews, at most one per booking.';

commit;
