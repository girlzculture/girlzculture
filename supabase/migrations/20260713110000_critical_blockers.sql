-- Section 1: one-time password reset codes and validation guardrails.
begin;

create table if not exists public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  phone text,
  channel text not null check (channel in ('email','sms')),
  code_hash text not null,
  ticket_hash text,
  attempts integer not null default 0 check (attempts between 0 and 5),
  verified_at timestamptz,
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);

alter table public.password_reset_codes enable row level security;
revoke all on public.password_reset_codes from anon, authenticated;
create index if not exists password_reset_codes_user_expiry_idx on public.password_reset_codes(user_id, expires_at desc);

-- NOT VALID preserves any legacy rows while enforcing these formats on new or changed data.
alter table public.salons drop constraint if exists salons_email_format_check;
alter table public.salons add constraint salons_email_format_check check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$') not valid;
alter table public.salons drop constraint if exists salons_us_phone_check;
alter table public.salons add constraint salons_us_phone_check check (phone is null or phone = '' or phone ~ '^\+1[2-9][0-9]{9}$') not valid;
alter table public.customers drop constraint if exists customers_email_format_check;
alter table public.customers add constraint customers_email_format_check check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$') not valid;
alter table public.customers drop constraint if exists customers_us_phone_check;
alter table public.customers add constraint customers_us_phone_check check (phone is null or phone = '' or phone ~ '^\+1[2-9][0-9]{9}$') not valid;
alter table public.bookings drop constraint if exists bookings_guest_email_format_check;
alter table public.bookings add constraint bookings_guest_email_format_check check (guest_email is null or guest_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$') not valid;
alter table public.bookings drop constraint if exists bookings_guest_us_phone_check;
alter table public.bookings add constraint bookings_guest_us_phone_check check (guest_phone is null or guest_phone = '' or guest_phone ~ '^\+1[2-9][0-9]{9}$') not valid;
alter table public.salon_applications drop constraint if exists salon_applications_email_format_check;
alter table public.salon_applications add constraint salon_applications_email_format_check check (business_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$') not valid;
alter table public.salon_applications drop constraint if exists salon_applications_us_phone_check;
alter table public.salon_applications add constraint salon_applications_us_phone_check check (phone ~ '^\+1[2-9][0-9]{9}$') not valid;

commit;
