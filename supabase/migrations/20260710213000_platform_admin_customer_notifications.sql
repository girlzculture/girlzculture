-- Girlz Culture platform administration, applications, customer accounts, and notifications.
create extension if not exists pgcrypto;

alter table public.salons add column if not exists owner_name text;
alter table public.salons add column if not exists business_type text;
alter table public.salons add column if not exists application_state text;
alter table public.salons add column if not exists rejection_reason text;
alter table public.salons add column if not exists approved_at timestamptz;
alter table public.customers add column if not exists name text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists avatar_url text;
alter table public.customers add column if not exists membership_tier text not null default 'Member';
alter table public.customers add column if not exists status text not null default 'Active';
alter table public.customers add column if not exists created_at timestamptz not null default now();
alter table public.bookings add column if not exists guest_name text;
alter table public.bookings add column if not exists guest_email text;
alter table public.bookings add column if not exists guest_phone text;
alter table public.bookings add column if not exists source text not null default 'Website';
alter table public.bookings add column if not exists notifications_sent_at timestamptz;

create table if not exists public.salon_applications (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  owner_name text not null,
  business_email text not null,
  phone text not null,
  street_address text not null,
  city text not null,
  state text not null,
  zip_code text not null,
  neighborhood text,
  business_type text not null,
  referral_source text,
  consent_authorized boolean not null default false,
  consent_terms boolean not null default false,
  consent_photos boolean not null default false,
  status text not null default 'Pending' check (status in ('Pending','Active','Rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (salon_id)
);

create table if not exists public.customer_favorites (
  customer_id uuid not null references public.customers(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, salon_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  salon_id uuid references public.salons(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  channel text not null default 'in_app',
  title text not null,
  body text not null,
  read_at timestamptz,
  delivery_status text not null default 'queued',
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  salon_id uuid references public.salons(id) on delete set null,
  subject text not null,
  message text not null,
  status text not null default 'Open',
  priority text not null default 'Normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_content (
  key text primary key,
  title text,
  body text,
  image_url text,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  discount_type text,
  discount_value numeric(10,2),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'Draft',
  created_at timestamptz not null default now()
);

create table if not exists public.admin_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists salon_applications_state_status_idx on public.salon_applications(state, status);
create index if not exists notifications_salon_unread_idx on public.notifications(salon_id, read_at, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, created_at desc);

alter table public.salon_applications enable row level security;
alter table public.customer_favorites enable row level security;
alter table public.notifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.platform_content enable row level security;
alter table public.platform_promotions enable row level security;
alter table public.admin_settings enable row level security;

create policy salon_applications_owner_read on public.salon_applications for select using (user_id = auth.uid() or public.is_admin());
create policy salon_applications_owner_insert on public.salon_applications for insert with check (user_id = auth.uid());
create policy salon_applications_owner_update on public.salon_applications for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy customer_favorites_self on public.customer_favorites for all using (customer_id = auth.uid() or public.is_admin()) with check (customer_id = auth.uid() or public.is_admin());
create policy notifications_recipient_read on public.notifications for select using (user_id = auth.uid() or public.owns_salon(salon_id) or public.is_admin());
create policy notifications_recipient_update on public.notifications for update using (user_id = auth.uid() or public.owns_salon(salon_id) or public.is_admin());
create policy support_ticket_parties on public.support_tickets for select using (customer_id = auth.uid() or public.owns_salon(salon_id) or public.is_admin());
create policy support_ticket_create on public.support_tickets for insert with check (customer_id = auth.uid() or public.owns_salon(salon_id) or public.is_admin());
create policy support_ticket_admin_update on public.support_tickets for update using (public.is_admin()) with check (public.is_admin());
create policy platform_content_public_read on public.platform_content for select using (true);
create policy platform_content_admin_write on public.platform_content for all using (public.is_admin()) with check (public.is_admin());
create policy platform_promotions_public_read on public.platform_promotions for select using (status = 'Active' or public.is_admin());
create policy platform_promotions_admin_write on public.platform_promotions for all using (public.is_admin()) with check (public.is_admin());
create policy admin_settings_admin_only on public.admin_settings for all using (public.is_admin()) with check (public.is_admin());

-- A booking insert always creates the durable in-app notification. Email/SMS delivery
-- is performed by the protected Next.js notification route immediately after booking.
create or replace function public.create_booking_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare salon_owner uuid;
begin
  select user_id into salon_owner from public.salons where id = new.salon_id;
  insert into public.notifications(user_id, salon_id, booking_id, title, body, delivery_status)
  values (salon_owner, new.salon_id, new.id, 'New booking received',
    'A new appointment was requested for ' || to_char(new.appointment_datetime, 'Mon DD, YYYY at HH12:MI AM'), 'delivered');
  return new;
end $$;

drop trigger if exists bookings_create_notification on public.bookings;
create trigger bookings_create_notification after insert on public.bookings
for each row execute function public.create_booking_notification();

-- Allow authenticated and guest booking creation while keeping reads owner/customer/admin scoped.
drop policy if exists bookings_public_insert on public.bookings;
create policy bookings_public_insert on public.bookings for insert to anon, authenticated
with check (salon_id is not null and style_id is not null);

-- Realtime keeps owner and admin views synchronized.
do $$ begin
  alter publication supabase_realtime add table public.bookings;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
