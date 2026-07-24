-- Server-authoritative salon promotion limits, redemption evidence, and immutable booking snapshots.

begin;

alter table public.booking_checkout_intents
  add column if not exists salon_promotion_redemption_id uuid,
  add column if not exists promotion_snapshot jsonb not null default '{}'::jsonb;

alter table public.bookings
  add column if not exists salon_promotion_redemption_id uuid,
  add column if not exists promotion_snapshot jsonb not null default '{}'::jsonb;

create table if not exists public.salon_promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid references public.salon_promotions(id) on delete set null,
  booking_intent_id uuid references public.booking_checkout_intents(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  salon_id uuid references public.salons(id) on delete set null,
  customer_id uuid,
  customer_identity_key text not null,
  status text not null default 'pending',
  promotion_snapshot jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  redeemed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint salon_promotion_redemptions_status_check
    check (status in ('pending','redeemed','cancelled','expired'))
);

create unique index if not exists salon_promotion_redemptions_intent_idx
  on public.salon_promotion_redemptions(booking_intent_id)
  where booking_intent_id is not null;
create index if not exists salon_promotion_redemptions_limit_idx
  on public.salon_promotion_redemptions(promotion_id,status,expires_at);
create index if not exists salon_promotion_redemptions_customer_idx
  on public.salon_promotion_redemptions(promotion_id,customer_identity_key,status);

alter table public.salon_promotion_redemptions enable row level security;
drop policy if exists salon_promotion_redemptions_authorized_read on public.salon_promotion_redemptions;
create policy salon_promotion_redemptions_authorized_read
on public.salon_promotion_redemptions for select to authenticated
using (
  public.admin_has_permission('marketing')
  or public.admin_has_permission('finance')
  or public.salon_has_permission(salon_id,'promotions')
  or public.salon_has_permission(salon_id,'bookings')
);
revoke all on table public.salon_promotion_redemptions from anon, authenticated;
grant select on table public.salon_promotion_redemptions to authenticated;

create or replace function public.reserve_salon_promotion(
  p_promotion_id uuid,
  p_booking_intent_id uuid,
  p_customer_id uuid,
  p_customer_email text,
  p_snapshot jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_promotion public.salon_promotions%rowtype;
  v_identity text;
  v_usage_limit integer;
  v_per_customer_limit integer;
  v_current_usage integer;
  v_customer_usage integer;
  v_redemption_id uuid;
begin
  select * into v_promotion
  from public.salon_promotions
  where id=p_promotion_id
  for update;

  if not found
    or v_promotion.status <> 'Active'
    or v_promotion.is_active is not true
    or v_promotion.archived_at is not null
    or (v_promotion.starts_at is not null and v_promotion.starts_at > now())
    or (v_promotion.ends_at is not null and v_promotion.ends_at < now())
  then
    raise exception 'PROMOTION_NOT_AVAILABLE' using errcode='P0001';
  end if;

  if not exists (
    select 1 from public.salons s
    where s.id=v_promotion.salon_id
      and public.is_marketplace_visible(s.id)
      and public.salon_has_feature(s.id,'promotions')
  ) then
    raise exception 'PROMOTION_NOT_AVAILABLE' using errcode='P0001';
  end if;

  update public.salon_promotion_redemptions
  set status='expired'
  where promotion_id=p_promotion_id and status='pending' and expires_at <= now();

  v_identity := case
    when p_customer_id is not null then 'user:' || p_customer_id::text
    else 'email:' || encode(digest(lower(trim(coalesce(p_customer_email,''))),'sha256'),'hex')
  end;
  v_usage_limit := greatest(0,coalesce(nullif(v_promotion.restrictions->>'usage_limit','')::integer,0));
  v_per_customer_limit := greatest(0,coalesce(nullif(v_promotion.restrictions->>'per_customer_limit','')::integer,0));

  select count(*) into v_current_usage
  from public.salon_promotion_redemptions
  where promotion_id=p_promotion_id
    and (status='redeemed' or (status='pending' and expires_at > now()));
  if v_usage_limit > 0 and v_current_usage >= v_usage_limit then
    raise exception 'PROMOTION_USAGE_LIMIT_REACHED' using errcode='P0001';
  end if;

  select count(*) into v_customer_usage
  from public.salon_promotion_redemptions
  where promotion_id=p_promotion_id
    and customer_identity_key=v_identity
    and (status='redeemed' or (status='pending' and expires_at > now()));
  if v_per_customer_limit > 0 and v_customer_usage >= v_per_customer_limit then
    raise exception 'PROMOTION_CUSTOMER_LIMIT_REACHED' using errcode='P0001';
  end if;

  insert into public.salon_promotion_redemptions(
    promotion_id,booking_intent_id,salon_id,customer_id,customer_identity_key,promotion_snapshot
  ) values (
    p_promotion_id,p_booking_intent_id,v_promotion.salon_id,p_customer_id,v_identity,coalesce(p_snapshot,'{}'::jsonb)
  ) returning id into v_redemption_id;
  return v_redemption_id;
end;
$$;

create or replace function public.redeem_salon_promotion(
  p_redemption_id uuid,
  p_booking_id uuid
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.salon_promotion_redemptions
  set status='redeemed',booking_id=p_booking_id,redeemed_at=now()
  where id=p_redemption_id and status='pending' and expires_at > now();
  if not found then
    raise exception 'PROMOTION_RESERVATION_NOT_AVAILABLE' using errcode='P0001';
  end if;
  return true;
end;
$$;

create or replace function public.cancel_salon_promotion_reservation(
  p_redemption_id uuid
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.salon_promotion_redemptions
  set status='cancelled',cancelled_at=now()
  where id=p_redemption_id and status='pending';
  return found;
end;
$$;

create or replace function public.finalize_booking_salon_promotion()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.salon_promotion_redemption_id is null then return new; end if;
  update public.salon_promotion_redemptions
  set status='redeemed',booking_id=new.id,redeemed_at=now()
  where id=new.salon_promotion_redemption_id
    and salon_id=new.salon_id
    and status='pending'
    and expires_at > now();
  if not found then
    raise exception 'PROMOTION_RESERVATION_NOT_AVAILABLE' using errcode='P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_finalize_salon_promotion on public.bookings;
create trigger bookings_finalize_salon_promotion
after insert on public.bookings
for each row execute function public.finalize_booking_salon_promotion();

revoke all on function public.reserve_salon_promotion(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.redeem_salon_promotion(uuid,uuid) from public,anon,authenticated;
revoke all on function public.cancel_salon_promotion_reservation(uuid) from public,anon,authenticated;
revoke all on function public.finalize_booking_salon_promotion() from public,anon,authenticated;
grant execute on function public.reserve_salon_promotion(uuid,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.redeem_salon_promotion(uuid,uuid) to service_role;
grant execute on function public.cancel_salon_promotion_reservation(uuid) to service_role;

commit;
