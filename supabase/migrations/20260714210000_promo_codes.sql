-- Stripe-backed discount codes with atomic usage reservations and tracking.

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  applies_to text not null check (applies_to in ('booking','subscription','both')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0,
  stripe_coupon_id text not null,
  stripe_promotion_code_id text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_codes_date_order check (ends_at > starts_at),
  constraint promo_codes_percent_range check (discount_type <> 'percent' or discount_value <= 100)
);
create unique index if not exists promo_codes_normalized_code_idx on public.promo_codes(lower(trim(code)));

alter table public.booking_checkout_intents add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;
alter table public.bookings
  add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null,
  add column if not exists promo_code text,
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists original_deposit_amount numeric(10,2);

create table if not exists public.promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete restrict,
  purpose text not null check (purpose in ('booking','subscription')),
  user_id uuid references auth.users(id) on delete set null,
  salon_id uuid references public.salons(id) on delete set null,
  booking_intent_id uuid references public.booking_checkout_intents(id) on delete set null,
  stripe_checkout_session_id text unique,
  status text not null default 'pending' check (status in ('pending','redeemed','expired','cancelled')),
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  redeemed_at timestamptz
);
create index if not exists promo_redemptions_code_status_idx on public.promo_code_redemptions(promo_code_id,status,expires_at);

alter table public.promo_codes enable row level security;
alter table public.promo_code_redemptions enable row level security;
drop policy if exists promo_codes_admin_all on public.promo_codes;
create policy promo_codes_admin_all on public.promo_codes for all to authenticated
using (public.admin_has_permission('marketing')) with check (public.admin_has_permission('marketing'));
drop policy if exists promo_redemptions_admin_read on public.promo_code_redemptions;
create policy promo_redemptions_admin_read on public.promo_code_redemptions for select to authenticated
using (public.admin_has_permission('marketing') or user_id=auth.uid() or public.salon_has_permission(salon_id,'subscription'));

create or replace function public.reserve_promo_code(
  p_code text,
  p_purpose text,
  p_user_id uuid default null,
  p_salon_id uuid default null,
  p_booking_intent_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_code public.promo_codes%rowtype; v_pending integer; v_redemption uuid;
begin
  select * into v_code from public.promo_codes where lower(trim(code))=lower(trim(p_code)) for update;
  if v_code.id is null or not v_code.is_active then raise exception 'PROMO_INVALID'; end if;
  if now() < v_code.starts_at then raise exception 'PROMO_NOT_STARTED'; end if;
  if now() >= v_code.ends_at then raise exception 'PROMO_EXPIRED'; end if;
  if p_purpose not in ('booking','subscription') or v_code.applies_to not in (p_purpose,'both') then raise exception 'PROMO_NOT_APPLICABLE'; end if;
  update public.promo_code_redemptions set status='expired' where promo_code_id=v_code.id and status='pending' and expires_at<=now();
  select count(*) into v_pending from public.promo_code_redemptions where promo_code_id=v_code.id and status='pending' and expires_at>now();
  if v_code.usage_limit is not null and v_code.usage_count + v_pending >= v_code.usage_limit then raise exception 'PROMO_LIMIT_REACHED'; end if;
  insert into public.promo_code_redemptions(promo_code_id,purpose,user_id,salon_id,booking_intent_id)
  values(v_code.id,p_purpose,p_user_id,p_salon_id,p_booking_intent_id) returning id into v_redemption;
  return jsonb_build_object('promo_code_id',v_code.id,'redemption_id',v_redemption,'code',upper(trim(v_code.code)),'discount_type',v_code.discount_type,'discount_value',v_code.discount_value,'stripe_coupon_id',v_code.stripe_coupon_id);
end; $$;

create or replace function public.redeem_promo_code(p_redemption_id uuid, p_checkout_session_id text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_promo uuid;
begin
  select promo_code_id into v_promo from public.promo_code_redemptions where id=p_redemption_id and status='pending' for update;
  if v_promo is null then return false; end if;
  update public.promo_code_redemptions set status='redeemed',redeemed_at=now(),stripe_checkout_session_id=p_checkout_session_id where id=p_redemption_id;
  update public.promo_codes set usage_count=usage_count+1,updated_at=now() where id=v_promo;
  return true;
end; $$;

create or replace function public.record_stripe_promo_redemption(p_promo_code_id uuid, p_purpose text, p_user_id uuid, p_salon_id uuid, p_checkout_session_id text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.promo_code_redemptions where stripe_checkout_session_id=p_checkout_session_id) then return false; end if;
  perform 1 from public.promo_codes where id=p_promo_code_id for update;
  insert into public.promo_code_redemptions(promo_code_id,purpose,user_id,salon_id,stripe_checkout_session_id,status,redeemed_at)
  values(p_promo_code_id,p_purpose,p_user_id,p_salon_id,p_checkout_session_id,'redeemed',now());
  update public.promo_codes set usage_count=usage_count+1,updated_at=now() where id=p_promo_code_id;
  return true;
end; $$;

revoke all on function public.reserve_promo_code(text,text,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.redeem_promo_code(uuid,text) from public,anon,authenticated;
revoke all on function public.record_stripe_promo_redemption(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_promo_code(text,text,uuid,uuid,uuid) to service_role;
grant execute on function public.redeem_promo_code(uuid,text) to service_role;
grant execute on function public.record_stripe_promo_redemption(uuid,text,uuid,uuid,text) to service_role;
