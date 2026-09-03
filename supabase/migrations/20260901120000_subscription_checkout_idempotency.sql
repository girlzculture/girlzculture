-- Serialize first-time subscription Checkout creation per salon. Provider
-- calls remain outside the database transaction, so every concurrent caller
-- receives the same durable attempt identity and therefore the same Stripe
-- idempotency keys.

begin;

create table if not exists public.subscription_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  requested_plan text not null
    check (requested_plan in ('Starter', 'Growth', 'Premium')),
  price_id text not null,
  normalized_promo_code text not null default '',
  promo_redemption_id uuid unique
    references public.promo_code_redemptions(id) on delete set null,
  stripe_customer_id text,
  stripe_checkout_session_id text unique,
  stripe_subscription_id text,
  status text not null default 'reserved'
    check (status in ('reserved', 'session_created', 'completed', 'expired', 'failed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id)
);

create index if not exists subscription_checkout_attempts_expiry_idx
  on public.subscription_checkout_attempts(status, expires_at);

alter table public.subscription_checkout_attempts enable row level security;
revoke all on public.subscription_checkout_attempts
  from public, anon, authenticated;
grant select, insert, update, delete on public.subscription_checkout_attempts
  to service_role;

create or replace function public.reserve_subscription_checkout_attempt(
  p_salon_id uuid,
  p_plan text,
  p_price_id text,
  p_promo_code text default '',
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.subscription_checkout_attempts%rowtype;
  v_attempt_id uuid;
  v_normalized_promo text := lower(trim(coalesce(p_promo_code, '')));
  v_promo jsonb := '{}'::jsonb;
  v_same_request boolean := false;
begin
  if p_salon_id is null
    or p_plan not in ('Starter', 'Growth', 'Premium')
    or nullif(trim(coalesce(p_price_id, '')), '') is null
  then
    raise exception using
      errcode = '22023',
      message = 'SUBSCRIPTION_CHECKOUT_ATTEMPT_INVALID';
  end if;

  if not exists (
    select 1 from public.salons salon where salon.id = p_salon_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'SUBSCRIPTION_CHECKOUT_SALON_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'girlz-culture:subscription-checkout:' || p_salon_id::text,
      0
    )
  );

  select attempt.*
  into v_attempt
  from public.subscription_checkout_attempts attempt
  where attempt.salon_id = p_salon_id
  for update;

  if found then
    v_same_request :=
      v_attempt.requested_plan = p_plan
      and v_attempt.price_id = trim(p_price_id)
      and v_attempt.normalized_promo_code = v_normalized_promo;

    if v_attempt.promo_redemption_id is not null then
      select jsonb_build_object(
        'promo_redemption_id', redemption.id,
        'promo_code', upper(trim(promo.code)),
        'stripe_coupon_id', promo.stripe_coupon_id
      )
      into v_promo
      from public.promo_code_redemptions redemption
      join public.promo_codes promo on promo.id = redemption.promo_code_id
      where redemption.id = v_attempt.promo_redemption_id;
      v_promo := coalesce(v_promo, '{}'::jsonb);
    end if;

    -- A linked provider session must be inspected before it can be replaced,
    -- even after the local expiry. It may have completed while its webhook is
    -- still pending.
    if v_attempt.status in ('session_created','completed')
      and v_attempt.stripe_checkout_session_id is not null
    then
      return jsonb_build_object(
        'attempt_id', v_attempt.id,
        'requested_plan', v_attempt.requested_plan,
        'price_id', v_attempt.price_id,
        'status', v_attempt.status,
        'expires_at', v_attempt.expires_at,
        'stripe_customer_id', v_attempt.stripe_customer_id,
        'stripe_checkout_session_id',
          v_attempt.stripe_checkout_session_id,
        'reused', true,
        'request_conflict', not v_same_request,
        'provider_reconciliation_required', true
      ) || v_promo;
    end if;

    if v_attempt.status = 'reserved' and v_attempt.expires_at > now() then
      return jsonb_build_object(
        'attempt_id', v_attempt.id,
        'requested_plan', v_attempt.requested_plan,
        'price_id', v_attempt.price_id,
        'status', v_attempt.status,
        'expires_at', v_attempt.expires_at,
        'stripe_customer_id', v_attempt.stripe_customer_id,
        'stripe_checkout_session_id', null,
        'reused', true,
        'request_conflict', not v_same_request,
        'provider_reconciliation_required', false
      ) || v_promo;
    end if;

    if v_attempt.promo_redemption_id is not null then
      update public.promo_code_redemptions redemption
      set status = 'expired'
      where redemption.id = v_attempt.promo_redemption_id
        and redemption.status = 'pending';
    end if;
  end if;

  if v_normalized_promo <> '' then
    v_promo := public.reserve_promo_code(
      v_normalized_promo,
      'subscription',
      p_user_id,
      p_salon_id,
      null
    );
  end if;

  v_attempt_id := gen_random_uuid();
  insert into public.subscription_checkout_attempts (
    id,
    salon_id,
    requested_plan,
    price_id,
    normalized_promo_code,
    promo_redemption_id,
    stripe_customer_id,
    stripe_checkout_session_id,
    status,
    expires_at,
    created_at,
    updated_at
  )
  values (
    v_attempt_id,
    p_salon_id,
    p_plan,
    trim(p_price_id),
    v_normalized_promo,
    nullif(v_promo ->> 'redemption_id', '')::uuid,
    null,
    null,
    'reserved',
    now() + interval '65 minutes',
    now(),
    now()
  )
  on conflict (salon_id) do update
  set id = excluded.id,
      requested_plan = excluded.requested_plan,
      price_id = excluded.price_id,
      normalized_promo_code = excluded.normalized_promo_code,
      promo_redemption_id = excluded.promo_redemption_id,
      stripe_customer_id = null,
      stripe_checkout_session_id = null,
      stripe_subscription_id = null,
      status = excluded.status,
      expires_at = excluded.expires_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;

  select attempt.*
  into v_attempt
  from public.subscription_checkout_attempts attempt
  where attempt.salon_id = p_salon_id;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'requested_plan', v_attempt.requested_plan,
    'price_id', v_attempt.price_id,
    'status', v_attempt.status,
    'expires_at', v_attempt.expires_at,
    'stripe_customer_id', v_attempt.stripe_customer_id,
    'stripe_checkout_session_id', null,
    'promo_redemption_id', v_attempt.promo_redemption_id,
    'reused', false,
    'request_conflict', false,
    'provider_reconciliation_required', false
  ) || (v_promo - 'redemption_id');
end;
$$;

create or replace function public.complete_subscription_checkout_attempt(
  p_attempt_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_subscription_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.subscription_checkout_attempts%rowtype;
begin
  select attempt.*
  into v_attempt
  from public.subscription_checkout_attempts attempt
  where attempt.id = p_attempt_id
  for update;
  if not found
    or v_attempt.stripe_checkout_session_id
      is distinct from trim(coalesce(p_stripe_checkout_session_id, ''))
  then
    return false;
  end if;
  if v_attempt.status = 'completed' then
    return v_attempt.stripe_subscription_id
      is not distinct from trim(coalesce(p_stripe_subscription_id, ''));
  end if;
  if v_attempt.status <> 'session_created'
    or nullif(trim(coalesce(p_stripe_subscription_id, '')), '') is null
  then
    return false;
  end if;

  update public.subscription_checkout_attempts attempt
  set status = 'completed',
      stripe_subscription_id = trim(p_stripe_subscription_id),
      updated_at = now()
  where attempt.id = p_attempt_id;
  return true;
end;
$$;

create or replace function public.release_completed_subscription_checkout_attempt(
  p_salon_id uuid,
  p_stripe_subscription_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.subscription_checkout_attempts%rowtype;
begin
  select attempt.*
  into v_attempt
  from public.subscription_checkout_attempts attempt
  where attempt.salon_id = p_salon_id
  for update;
  if not found then
    return false;
  end if;
  if v_attempt.status <> 'completed'
    or v_attempt.stripe_subscription_id
      is distinct from trim(coalesce(p_stripe_subscription_id, ''))
  then
    return false;
  end if;
  update public.subscription_checkout_attempts attempt
  set status = 'expired', updated_at = now()
  where attempt.id = v_attempt.id;
  return true;
end;
$$;

create or replace function public.link_subscription_checkout_attempt(
  p_attempt_id uuid,
  p_stripe_customer_id text,
  p_stripe_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.subscription_checkout_attempts%rowtype;
begin
  if p_attempt_id is null
    or nullif(trim(coalesce(p_stripe_customer_id, '')), '') is null
    or nullif(trim(coalesce(p_stripe_checkout_session_id, '')), '') is null
  then
    raise exception using
      errcode = '22023',
      message = 'SUBSCRIPTION_CHECKOUT_LINK_INVALID';
  end if;

  select attempt.*
  into v_attempt
  from public.subscription_checkout_attempts attempt
  where attempt.id = p_attempt_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'SUBSCRIPTION_CHECKOUT_ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.stripe_checkout_session_id is not null
    and v_attempt.stripe_checkout_session_id
      <> trim(p_stripe_checkout_session_id)
  then
    raise exception using
      errcode = '23505',
      message = 'SUBSCRIPTION_CHECKOUT_SESSION_CONFLICT';
  end if;

  update public.subscription_checkout_attempts attempt
  set stripe_customer_id = trim(p_stripe_customer_id),
      stripe_checkout_session_id = trim(p_stripe_checkout_session_id),
      status = 'session_created',
      updated_at = now()
  where attempt.id = p_attempt_id;

  update public.promo_code_redemptions redemption
  set stripe_checkout_session_id = trim(p_stripe_checkout_session_id)
  where redemption.id = v_attempt.promo_redemption_id
    and redemption.status = 'pending'
    and redemption.stripe_checkout_session_id is null;

  return true;
end;
$$;

create or replace function public.expire_subscription_checkout_attempt(
  p_attempt_id uuid,
  p_stripe_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.subscription_checkout_attempts%rowtype;
begin
  select attempt.*
  into v_attempt
  from public.subscription_checkout_attempts attempt
  where attempt.id = p_attempt_id
  for update;
  if not found
    or v_attempt.stripe_checkout_session_id
      is distinct from trim(coalesce(p_stripe_checkout_session_id, ''))
  then
    return false;
  end if;

  update public.subscription_checkout_attempts attempt
  set status = 'expired', updated_at = now()
  where attempt.id = p_attempt_id;

  update public.promo_code_redemptions redemption
  set status = 'expired'
  where redemption.id = v_attempt.promo_redemption_id
    and redemption.status = 'pending';
  return true;
end;
$$;

revoke all on function public.reserve_subscription_checkout_attempt(
  uuid, text, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.link_subscription_checkout_attempt(
  uuid, text, text
) from public, anon, authenticated;
revoke all on function public.expire_subscription_checkout_attempt(
  uuid, text
) from public, anon, authenticated;
revoke all on function public.complete_subscription_checkout_attempt(
  uuid, text, text
) from public, anon, authenticated;
revoke all on function public.release_completed_subscription_checkout_attempt(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.reserve_subscription_checkout_attempt(
  uuid, text, text, text, uuid
) to service_role;
grant execute on function public.link_subscription_checkout_attempt(
  uuid, text, text
) to service_role;
grant execute on function public.expire_subscription_checkout_attempt(
  uuid, text
) to service_role;
grant execute on function public.complete_subscription_checkout_attempt(
  uuid, text, text
) to service_role;
grant execute on function public.release_completed_subscription_checkout_attempt(
  uuid, text
) to service_role;

update public.engine_settings
set published_value = '"20260901120000"'::jsonb,
    draft_value = '"20260901120000"'::jsonb,
    updated_at = now()
where setting_key = 'integrations.expected_migration';

notify pgrst, 'reload schema';

commit;
