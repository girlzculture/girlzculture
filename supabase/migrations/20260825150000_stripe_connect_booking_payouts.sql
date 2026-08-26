-- Idempotent, auditable Platform Admin release of verified booking proceeds to
-- a salon's Stripe Connect account. A Connect transfer is tracked separately
-- from the connected account's later bank payout schedule.

begin;

alter table public.bookings
  add column if not exists bank_payout_status text,
  add column if not exists transfer_submitted_at timestamptz,
  add column if not exists payout_completed_at timestamptz;

create table if not exists public.salon_payout_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  salon_id uuid not null references public.salons(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  connected_account_id text not null check (connected_account_id like 'acct\_%' escape '\\'),
  source_charge_id text,
  idempotency_key text not null unique,
  status text not null default 'Processing'
    check (status in ('Processing','Transferred','Failed','Reversed')),
  stripe_transfer_id text unique,
  provider_status text,
  failure_reference uuid,
  failure_code text,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (booking_id, attempt_number)
);

create unique index if not exists salon_payout_one_processing_per_booking_idx
  on public.salon_payout_attempts(booking_id)
  where status='Processing';
create index if not exists salon_payout_attempts_salon_time_idx
  on public.salon_payout_attempts(salon_id,requested_at desc);
create index if not exists salon_payout_attempts_status_time_idx
  on public.salon_payout_attempts(status,requested_at desc);

alter table public.salon_payout_attempts enable row level security;
drop policy if exists salon_payout_attempts_admin_read on public.salon_payout_attempts;
create policy salon_payout_attempts_admin_read
  on public.salon_payout_attempts for select to authenticated
  using (public.admin_has_permission('finance'));
drop policy if exists salon_payout_attempts_salon_read on public.salon_payout_attempts;
create policy salon_payout_attempts_salon_read
  on public.salon_payout_attempts for select to authenticated
  using (public.salon_has_permission(salon_id,'earnings'));
revoke all on table public.salon_payout_attempts from anon,authenticated;
grant select on table public.salon_payout_attempts to authenticated;

create or replace function public.admin_reserve_booking_payout(
  p_actor_user_id uuid,
  p_booking_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
#variable_conflict error
declare
  v_admin public.admin_users%rowtype;
  v_booking public.bookings%rowtype;
  v_salon public.salons%rowtype;
  v_attempt public.salon_payout_attempts%rowtype;
  v_attempt_number integer;
  v_amount numeric(10,2);
  v_idempotency_key text;
begin
  select admin_user.* into v_admin
  from public.admin_users admin_user
  where coalesce(admin_user.user_id,admin_user.id)=p_actor_user_id
    and admin_user.status='Active';
  if not found or not (
    coalesce(v_admin.is_super_admin,false)
    or coalesce((v_admin.permissions->>'finance')::boolean,false)
  ) then raise exception 'You do not have permission to release salon funds.'; end if;

  select booking.* into v_booking
  from public.bookings booking
  where booking.id=p_booking_id
  for update;
  if not found then raise exception 'Booking not found.'; end if;
  select salon.* into v_salon from public.salons salon where salon.id=v_booking.salon_id;
  if not found then raise exception 'Salon not found.'; end if;

  if v_booking.stripe_transfer_id is not null then
    raise exception 'This booking has already been transferred to the salon.';
  end if;
  if lower(coalesce(v_booking.deposit_status,'')) not in ('paid','succeeded')
     or v_booking.payment_verified_at is null then
    raise exception 'Only a Stripe-verified paid deposit can be transferred.';
  end if;
  if lower(coalesce(v_booking.refund_status,'')) in ('pending','succeeded','refunded')
     or lower(coalesce(v_booking.payout_status,''))='refund pending' then
    raise exception 'This booking has a pending or completed refund and cannot be paid out.';
  end if;
  v_amount:=round(greatest(0,coalesce(v_booking.net_amount_owed_salon,0))::numeric,2);
  if v_amount<=0 then raise exception 'There is no verified amount owed to this salon.'; end if;
  if coalesce(v_salon.stripe_account_id,'') !~ '^acct_[A-Za-z0-9]+$' then
    raise exception 'The salon has not connected a valid Stripe account.';
  end if;
  if coalesce(v_booking.stripe_charge_id,'') !~ '^ch_[A-Za-z0-9]+$' then
    raise exception 'The source Stripe charge could not be verified.';
  end if;

  select attempt.* into v_attempt
  from public.salon_payout_attempts attempt
  where attempt.booking_id=p_booking_id and attempt.status='Processing'
  for update;
  if found and v_attempt.requested_at>now()-interval '10 minutes' then
    return jsonb_build_object(
      'attempt_id',v_attempt.id,
      'booking_id',v_attempt.booking_id,
      'salon_id',v_attempt.salon_id,
      'amount',v_attempt.amount,
      'currency',v_attempt.currency,
      'connected_account_id',v_attempt.connected_account_id,
      'source_charge_id',v_attempt.source_charge_id,
      'idempotency_key',v_attempt.idempotency_key,
      'attempt_number',v_attempt.attempt_number,
      'reused',true
    );
  elsif found then
    update public.salon_payout_attempts attempt
    set status='Failed',provider_status='lease_expired',failure_code='PROCESSING_LEASE_EXPIRED',updated_at=now(),completed_at=now()
    where attempt.id=v_attempt.id;
  end if;

  select coalesce(max(attempt.attempt_number),0)+1 into v_attempt_number
  from public.salon_payout_attempts attempt
  where attempt.booking_id=p_booking_id;
  v_idempotency_key:='gc-booking-payout:'||p_booking_id::text||':'||v_attempt_number::text;

  insert into public.salon_payout_attempts(
    booking_id,salon_id,attempt_number,amount,currency,connected_account_id,
    source_charge_id,idempotency_key,status,requested_by
  ) values (
    p_booking_id,v_booking.salon_id,v_attempt_number,v_amount,'usd',
    v_salon.stripe_account_id,v_booking.stripe_charge_id,v_idempotency_key,
    'Processing',p_actor_user_id
  ) returning * into v_attempt;

  update public.bookings booking
  set payout_status='Processing',
      transfer_status='Transfer processing',
      bank_payout_status='Not started',
      updated_at=now()
  where booking.id=p_booking_id;

  return jsonb_build_object(
    'attempt_id',v_attempt.id,
    'booking_id',v_attempt.booking_id,
    'salon_id',v_attempt.salon_id,
    'amount',v_attempt.amount,
    'currency',v_attempt.currency,
    'connected_account_id',v_attempt.connected_account_id,
    'source_charge_id',v_attempt.source_charge_id,
    'idempotency_key',v_attempt.idempotency_key,
    'attempt_number',v_attempt.attempt_number,
    'reused',false
  );
end
$$;

create or replace function public.admin_finalize_booking_payout(
  p_actor_user_id uuid,
  p_attempt_id uuid,
  p_outcome text,
  p_stripe_transfer_id text default null,
  p_provider_status text default null,
  p_failure_reference uuid default null,
  p_failure_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
#variable_conflict error
declare
  v_admin public.admin_users%rowtype;
  v_attempt public.salon_payout_attempts%rowtype;
  v_booking public.bookings%rowtype;
  v_outcome text:=lower(trim(coalesce(p_outcome,'')));
begin
  select admin_user.* into v_admin
  from public.admin_users admin_user
  where coalesce(admin_user.user_id,admin_user.id)=p_actor_user_id
    and admin_user.status='Active';
  if not found or not (
    coalesce(v_admin.is_super_admin,false)
    or coalesce((v_admin.permissions->>'finance')::boolean,false)
  ) then raise exception 'You do not have permission to finalize this payout.'; end if;

  select attempt.* into v_attempt
  from public.salon_payout_attempts attempt
  where attempt.id=p_attempt_id
  for update;
  if not found then raise exception 'Payout attempt not found.'; end if;
  select booking.* into v_booking
  from public.bookings booking
  where booking.id=v_attempt.booking_id
  for update;
  if not found then raise exception 'Booking not found.'; end if;

  if v_outcome='transferred' then
    if coalesce(p_stripe_transfer_id,'') !~ '^tr_[A-Za-z0-9]+$' then
      raise exception 'Stripe transfer confirmation is required.';
    end if;
    if v_attempt.status='Transferred' then return to_jsonb(v_attempt); end if;
    if v_attempt.status<>'Processing' then raise exception 'Only a processing payout can be completed.'; end if;
    update public.salon_payout_attempts attempt
    set status='Transferred',stripe_transfer_id=p_stripe_transfer_id,
        provider_status=coalesce(nullif(p_provider_status,''),'succeeded'),
        failure_reference=null,failure_code=null,completed_at=now(),updated_at=now()
    where attempt.id=p_attempt_id
    returning * into v_attempt;
    update public.bookings booking
    set stripe_transfer_id=p_stripe_transfer_id,
        transfer_status='Transferred to salon',
        payout_status='Transferred to salon',
        bank_payout_status='Managed by salon Stripe payout schedule',
        transfer_submitted_at=now(),
        payout_completed_at=now(),
        updated_at=now()
    where booking.id=v_attempt.booking_id;
  elsif v_outcome='failed' then
    if v_attempt.status='Transferred' then raise exception 'A completed transfer cannot be marked failed.'; end if;
    update public.salon_payout_attempts attempt
    set status='Failed',provider_status=coalesce(nullif(p_provider_status,''),'failed'),
        failure_reference=p_failure_reference,failure_code=nullif(p_failure_code,''),
        completed_at=now(),updated_at=now()
    where attempt.id=p_attempt_id
    returning * into v_attempt;
    update public.bookings booking
    set transfer_status='Not transferred',
        payout_status='Failed/requires attention',
        bank_payout_status='Not started',
        updated_at=now()
    where booking.id=v_attempt.booking_id;
  else
    raise exception 'Choose transferred or failed.';
  end if;
  return to_jsonb(v_attempt);
end
$$;

revoke all on function public.admin_reserve_booking_payout(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.admin_reserve_booking_payout(uuid,uuid)
  to service_role;
revoke all on function public.admin_finalize_booking_payout(uuid,uuid,text,text,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.admin_finalize_booking_payout(uuid,uuid,text,text,text,uuid,text)
  to service_role;

update public.engine_settings
set published_value='"20260825150000"'::jsonb,
    draft_value='"20260825150000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';

commit;