-- Girlz Culture owner-dashboard data model.
-- Additive only: existing salon, booking, style, and review data is preserved.

alter table public.salons add column if not exists languages text[] not null default '{}';
alter table public.salons add column if not exists trust_info jsonb not null default '{}'::jsonb;
alter table public.salons add column if not exists media_consent boolean not null default false;
alter table public.salons add column if not exists notification_preferences jsonb not null default '{"bookings":true,"reviews":true,"marketing":true}'::jsonb;
alter table public.salons add column if not exists booking_settings jsonb not null default '{"slot_minutes":30,"buffer_minutes":15,"any_available_stylist":true}'::jsonb;

alter table public.styles add column if not exists included_items text[] not null default '{}';
alter table public.stylists add column if not exists avatar_url text;
alter table public.stylists add column if not exists years_experience integer not null default 0 check (years_experience >= 0);
alter table public.stylists add column if not exists availability jsonb not null default '{}'::jsonb;

create table if not exists public.salon_products (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null default 0 check (price >= 0),
  photo_url text,
  in_person_only boolean not null default true,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.salon_promotions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  title text not null,
  description text,
  discount_label text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  featured_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.salon_blockouts (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  stylist_id uuid references public.stylists(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  all_day boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists salon_products_salon_id_idx on public.salon_products(salon_id);
create index if not exists salon_promotions_salon_id_idx on public.salon_promotions(salon_id);
create index if not exists salon_blockouts_salon_id_idx on public.salon_blockouts(salon_id);

alter table public.salon_products enable row level security;
alter table public.salon_promotions enable row level security;
alter table public.salon_blockouts enable row level security;

drop policy if exists salon_products_public_read on public.salon_products;
create policy salon_products_public_read on public.salon_products for select to anon, authenticated
using (is_visible or public.owns_salon(salon_id) or public.is_admin());
drop policy if exists salon_products_owner_write on public.salon_products;
create policy salon_products_owner_write on public.salon_products for all to authenticated
using (public.owns_salon(salon_id) or public.is_admin())
with check (public.owns_salon(salon_id) or public.is_admin());

drop policy if exists salon_promotions_public_read on public.salon_promotions;
create policy salon_promotions_public_read on public.salon_promotions for select to anon, authenticated
using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())) or public.owns_salon(salon_id) or public.is_admin());
drop policy if exists salon_promotions_owner_write on public.salon_promotions;
create policy salon_promotions_owner_write on public.salon_promotions for all to authenticated
using (public.owns_salon(salon_id) or public.is_admin())
with check (public.owns_salon(salon_id) or public.is_admin());

drop policy if exists salon_blockouts_owner_access on public.salon_blockouts;
create policy salon_blockouts_owner_access on public.salon_blockouts for all to authenticated
using (public.owns_salon(salon_id) or public.is_admin())
with check (public.owns_salon(salon_id) or public.is_admin());

-- Owners need a narrow update policy to confirm, reschedule, complete, cancel,
-- or flag appointments belonging to their own salon.
drop policy if exists bookings_owner_update on public.bookings;
create policy bookings_owner_update on public.bookings for update to authenticated
using (public.owns_salon(salon_id) or public.is_admin())
with check (public.owns_salon(salon_id) or public.is_admin());
