begin;

-- Payment setup is not a subscription purchase. Preserve attempt generations
-- permanently so an old Checkout/webhook can never replace a later card.
create table public.subscription_payment_method_attempts (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  actor_id uuid,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  livemode boolean not null,
  status text not null default 'reserved'
    check (status in ('reserved','open','processing','completed','cancelled','expired','failed')),
  stripe_checkout_session_id text unique,
  stripe_setup_intent_id text,
  stripe_payment_method_id text,
  baseline_payment_method_id text,
  first_apply_at timestamptz,
  provider_request_id text,
  lease_id uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index subscription_payment_method_one_active_salon
  on public.subscription_payment_method_attempts(salon_id)
  where status in ('reserved','open','processing');
create unique index subscription_payment_method_one_active_subscription
  on public.subscription_payment_method_attempts(stripe_subscription_id)
  where status in ('reserved','open','processing');
alter table public.subscription_payment_method_attempts enable row level security;
revoke all on public.subscription_payment_method_attempts from public, anon, authenticated;
grant select, insert, update on public.subscription_payment_method_attempts to service_role;
-- Invoker routines need only these identity columns on existing relations.
-- Declare them explicitly instead of relying on managed-platform defaults.
grant select(id,user_id) on public.salons to service_role;
grant select(salon_id,stripe_customer_id,stripe_subscription_id) on public.subscriptions to service_role;

create function public.reserve_subscription_payment_method_attempt(
  p_salon_id uuid, p_actor_id uuid, p_customer_id text, p_subscription_id text, p_livemode boolean,
  p_baseline_method_id text default null
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_attempt public.subscription_payment_method_attempts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('payment-method:' || p_salon_id::text,0));
  if not exists (select 1 from public.salons where id=p_salon_id and user_id=p_actor_id) then
    raise exception 'PAYMENT_METHOD_OWNER_IDENTITY_CONFLICT'; end if;
  if not exists (select 1 from public.subscriptions where salon_id=p_salon_id
    and stripe_customer_id=p_customer_id and stripe_subscription_id=p_subscription_id) then
    raise exception 'PAYMENT_METHOD_SUBSCRIPTION_IDENTITY_CONFLICT';
  end if;
  select * into v_attempt from public.subscription_payment_method_attempts
    where salon_id=p_salon_id and status in ('reserved','open','processing') for update;
  if found then
    if v_attempt.stripe_customer_id<>p_customer_id or v_attempt.stripe_subscription_id<>p_subscription_id
      or v_attempt.livemode<>p_livemode or v_attempt.actor_id is distinct from p_actor_id then raise exception 'PAYMENT_METHOD_ACTIVE_ATTEMPT_CONFLICT'; end if;
    return to_jsonb(v_attempt);
  end if;
  insert into public.subscription_payment_method_attempts(salon_id,actor_id,stripe_customer_id,stripe_subscription_id,livemode,baseline_payment_method_id)
    values(p_salon_id,p_actor_id,p_customer_id,p_subscription_id,p_livemode,p_baseline_method_id) returning * into v_attempt;
  return to_jsonb(v_attempt);
end $$;

create function public.bind_subscription_payment_method_attempt(p_attempt_id uuid,p_session_id text,p_request_id text default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_attempt public.subscription_payment_method_attempts%rowtype;
begin
  select * into strict v_attempt from public.subscription_payment_method_attempts where id=p_attempt_id for update;
  if v_attempt.status not in ('reserved','open') or
    (v_attempt.stripe_checkout_session_id is not null and v_attempt.stripe_checkout_session_id<>p_session_id)
    or p_session_id !~ '^cs_[A-Za-z0-9_]+$' then raise exception 'PAYMENT_METHOD_SESSION_BIND_REJECTED'; end if;
  update public.subscription_payment_method_attempts set stripe_checkout_session_id=p_session_id,status='open',
    provider_request_id=case when p_request_id ~ '^req_[A-Za-z0-9]+$' then p_request_id else provider_request_id end,
    updated_at=now() where id=p_attempt_id returning * into v_attempt;
  return to_jsonb(v_attempt);
end $$;

create function public.claim_subscription_payment_method_attempt(p_attempt_id uuid,p_session_id text,p_lease_id uuid)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_attempt public.subscription_payment_method_attempts%rowtype;
begin
  select * into strict v_attempt from public.subscription_payment_method_attempts where id=p_attempt_id for update;
  if v_attempt.stripe_checkout_session_id is distinct from p_session_id then raise exception 'PAYMENT_METHOD_SESSION_IDENTITY_CONFLICT'; end if;
  if v_attempt.status in ('completed','cancelled','expired','failed') or
    (v_attempt.status='processing' and v_attempt.lease_expires_at>now()) then
    return jsonb_build_object('claimed',false,'attempt',to_jsonb(v_attempt));
  end if;
  if not exists (select 1 from public.subscriptions where salon_id=v_attempt.salon_id
    and stripe_customer_id=v_attempt.stripe_customer_id and stripe_subscription_id=v_attempt.stripe_subscription_id) then
    raise exception 'PAYMENT_METHOD_SUBSCRIPTION_IDENTITY_CONFLICT'; end if;
  if not exists (select 1 from public.salons where id=v_attempt.salon_id and user_id=v_attempt.actor_id) then
    raise exception 'PAYMENT_METHOD_OWNER_IDENTITY_CONFLICT'; end if;
  update public.subscription_payment_method_attempts set status='processing',lease_id=p_lease_id,
    lease_expires_at=now()+interval '2 minutes',updated_at=now() where id=p_attempt_id returning * into v_attempt;
  return jsonb_build_object('claimed',true,'attempt',to_jsonb(v_attempt));
end $$;

-- Record the first provider-write boundary before crossing it. Reclaiming a
-- lease never resets Stripe's finite idempotency retention window or its target.
create function public.mark_subscription_payment_method_apply(
  p_attempt_id uuid,p_lease_id uuid,p_setup_intent_id text,p_payment_method_id text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_attempt public.subscription_payment_method_attempts%rowtype;
begin
  select * into strict v_attempt from public.subscription_payment_method_attempts where id=p_attempt_id for update;
  if v_attempt.status<>'processing' or v_attempt.lease_id is distinct from p_lease_id
    or v_attempt.lease_expires_at<=now() then raise exception 'PAYMENT_METHOD_LEASE_LOST'; end if;
  if not exists(select 1 from public.salons where id=v_attempt.salon_id and user_id=v_attempt.actor_id) then
    raise exception 'PAYMENT_METHOD_OWNER_IDENTITY_CONFLICT'; end if;
  if p_setup_intent_id is null or p_setup_intent_id !~ '^seti_[A-Za-z0-9_]+$'
    or p_payment_method_id is null or p_payment_method_id !~ '^pm_[A-Za-z0-9_]+$'
    or (v_attempt.stripe_setup_intent_id is not null and v_attempt.stripe_setup_intent_id<>p_setup_intent_id)
    or (v_attempt.stripe_payment_method_id is not null and v_attempt.stripe_payment_method_id<>p_payment_method_id) then
    raise exception 'PAYMENT_METHOD_APPLY_IDENTITY_CONFLICT'; end if;
  update public.subscription_payment_method_attempts set first_apply_at=coalesce(first_apply_at,now()),
    stripe_setup_intent_id=p_setup_intent_id,stripe_payment_method_id=p_payment_method_id,updated_at=now()
    where id=p_attempt_id returning * into v_attempt;
  return to_jsonb(v_attempt);
end $$;

create function public.finish_subscription_payment_method_attempt(
  p_attempt_id uuid,p_lease_id uuid,p_status text,p_setup_intent_id text default null,
  p_payment_method_id text default null,p_request_id text default null
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_status not in ('open','completed','cancelled','expired') then raise exception 'PAYMENT_METHOD_INVALID_RESULT'; end if;
  if p_status='completed' and (p_setup_intent_id is null or p_setup_intent_id !~ '^seti_[A-Za-z0-9_]+$'
    or p_payment_method_id is null or p_payment_method_id !~ '^pm_[A-Za-z0-9_]+$') then
    raise exception 'PAYMENT_METHOD_COMPLETION_IDENTITY_MISSING'; end if;
  update public.subscription_payment_method_attempts set status=p_status,
    stripe_setup_intent_id=coalesce(p_setup_intent_id,stripe_setup_intent_id),
    stripe_payment_method_id=coalesce(p_payment_method_id,stripe_payment_method_id),
    provider_request_id=case when p_request_id ~ '^req_[A-Za-z0-9]+$' then p_request_id else provider_request_id end,
    lease_id=null,lease_expires_at=null,updated_at=now()
    where id=p_attempt_id and status='processing' and lease_id=p_lease_id;
  return found;
end $$;

revoke all on function public.reserve_subscription_payment_method_attempt(uuid,uuid,text,text,boolean,text) from public,anon,authenticated;
revoke all on function public.bind_subscription_payment_method_attempt(uuid,text,text) from public,anon,authenticated;
revoke all on function public.claim_subscription_payment_method_attempt(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.finish_subscription_payment_method_attempt(uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.mark_subscription_payment_method_apply(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_subscription_payment_method_attempt(uuid,uuid,text,text,boolean,text) to service_role;
grant execute on function public.bind_subscription_payment_method_attempt(uuid,text,text) to service_role;
grant execute on function public.claim_subscription_payment_method_attempt(uuid,text,uuid) to service_role;
grant execute on function public.finish_subscription_payment_method_attempt(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.mark_subscription_payment_method_apply(uuid,uuid,text,text) to service_role;
update public.engine_settings set published_value='"20260919015517"'::jsonb,draft_value='"20260919015517"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
