begin;

alter table public.bookings
  add column if not exists transfer_status text not null default 'Not transferred',
  add column if not exists financial_status text not null default 'Deposit not received',
  add column if not exists refund_eligibility_status text,
  add column if not exists refund_policy_outcome text;

create table if not exists public.salon_recovery_balances (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'usd',
  status text not null default 'Recoverable from future payout'
    check (status in ('Recoverable from future payout','Applied to payout','Resolved','Disputed')),
  reason text not null,
  stripe_transfer_id text,
  applied_to_payout_id text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id)
);

create index if not exists salon_recovery_balances_salon_status_idx
  on public.salon_recovery_balances (salon_id, status, created_at desc);

alter table public.salon_recovery_balances enable row level security;
drop policy if exists salon_recovery_balances_admin_read on public.salon_recovery_balances;
create policy salon_recovery_balances_admin_read
  on public.salon_recovery_balances for select to authenticated
  using (public.is_admin());
drop policy if exists salon_recovery_balances_salon_read on public.salon_recovery_balances;
create policy salon_recovery_balances_salon_read
  on public.salon_recovery_balances for select to authenticated
  using (public.salon_has_permission(salon_id,'earnings'));
revoke all on table public.salon_recovery_balances from anon, authenticated;
grant select on table public.salon_recovery_balances to authenticated;

create table if not exists public.booking_financial_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  salon_id uuid not null references public.salons(id) on delete restrict,
  event_type text not null,
  actor text not null default 'system',
  refund_status text,
  transfer_status text,
  payout_status text,
  deposit_amount numeric(10,2) not null default 0,
  refund_amount numeric(10,2) not null default 0,
  net_amount_owed_salon numeric(10,2) not null default 0,
  stripe_refund_id text,
  stripe_transfer_id text,
  stripe_transfer_reversal_id text,
  occurred_at timestamptz not null default now()
);

create index if not exists booking_financial_events_booking_time_idx
  on public.booking_financial_events (booking_id, occurred_at desc);
create index if not exists booking_financial_events_salon_time_idx
  on public.booking_financial_events (salon_id, occurred_at desc);

alter table public.booking_financial_events enable row level security;
drop policy if exists booking_financial_events_admin_read on public.booking_financial_events;
create policy booking_financial_events_admin_read
  on public.booking_financial_events for select to authenticated
  using (public.is_admin());
drop policy if exists booking_financial_events_salon_read on public.booking_financial_events;
create policy booking_financial_events_salon_read
  on public.booking_financial_events for select to authenticated
  using (public.salon_has_permission(salon_id,'earnings'));
revoke all on table public.booking_financial_events from anon, authenticated;
grant select on table public.booking_financial_events to authenticated;

create or replace function public.reconcile_booking_financial_state()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_refund text := lower(coalesce(new.refund_status,''));
  v_deposit numeric := greatest(0,coalesce(new.deposit_amount,0));
  v_refund_amount numeric := greatest(0,coalesce(new.refund_amount,0));
  v_actor text := lower(coalesce(new.cancelled_by,new.cancellation_initiated_by,''));
begin
  if new.stripe_transfer_reversal_id is not null then
    new.transfer_status := 'Transfer reversed';
  elsif exists (
    select 1 from public.salon_recovery_balances r
    where r.booking_id=new.id and r.status='Recoverable from future payout'
  ) then
    new.transfer_status := 'Recoverable from future payout';
  elsif new.stripe_transfer_id is not null then
    new.transfer_status := 'Transferred to salon';
  else
    new.transfer_status := 'Not transferred';
  end if;

  if v_refund='pending' then
    new.financial_status := 'Refund pending';
    new.payout_status := 'Refund pending';
    new.net_amount_owed_salon := 0;
    new.deposit_status := 'Refund pending';
  elsif v_refund in ('succeeded','partially refunded') then
    new.deposit_status := case
      when v_refund_amount + 0.0001 >= v_deposit then 'Refunded'
      else 'Partially refunded'
    end;
    if v_refund_amount + 0.0001 >= v_deposit then
      new.net_amount_owed_salon := 0;
      new.financial_status := 'Refunded';
      new.payout_status := case
        when new.transfer_status='Transfer reversed' then 'Transfer reversed'
        when new.transfer_status='Recoverable from future payout' then 'Recoverable from future payout'
        else 'Refunded'
      end;
    else
      new.net_amount_owed_salon := greatest(
        0,
        v_deposit - v_refund_amount - coalesce(new.stripe_processing_fee,0) - coalesce(new.platform_fee,0)
      );
      new.financial_status := 'Partially refunded';
      new.payout_status := case when new.net_amount_owed_salon=0 then 'Refunded' else 'Awaiting payout' end;
    end if;
  elsif v_refund in ('failed','disputed') then
    new.financial_status := 'Failed/requires attention';
    new.payout_status := 'Failed/requires attention';
  elsif lower(coalesce(new.status,'')) in ('cancelled','canceled') then
    new.financial_status := case
      when v_actor='customer' then 'Customer canceled'
      when v_actor='salon' then 'Salon canceled'
      else initcap(coalesce(nullif(v_actor,''),'system')) || ' canceled'
    end;
    if v_deposit=0 then
      new.net_amount_owed_salon := 0;
      new.payout_status := 'Not required';
    end if;
  elsif lower(coalesce(new.deposit_status,'')) in ('paid','succeeded') then
    new.financial_status := case
      when lower(coalesce(new.status,''))='completed' then 'Deposit received'
      else 'Deposit received'
    end;
  end if;

  -- A full refund can never simultaneously remain payable to a salon.
  if new.financial_status='Refunded' then
    new.net_amount_owed_salon := 0;
    if new.payout_status='Awaiting payout' then new.payout_status := 'Refunded'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reconcile_booking_financial_state on public.bookings;
create trigger reconcile_booking_financial_state
before insert or update of
  status,deposit_status,refund_status,refund_amount,payout_status,
  net_amount_owed_salon,stripe_transfer_id,stripe_transfer_reversal_id,cancelled_by
on public.bookings
for each row execute function public.reconcile_booking_financial_state();

-- Non-destructive reconciliation of contradictory historical display state.
update public.bookings
set
  financial_status = case
    when lower(coalesce(refund_status,'')) in ('succeeded','partially refunded') then
      case when coalesce(refund_amount,0)+0.0001>=coalesce(deposit_amount,0) then 'Refunded' else 'Partially refunded' end
    when lower(coalesce(refund_status,''))='pending' then 'Refund pending'
    when lower(coalesce(status,'')) in ('cancelled','canceled') and lower(coalesce(cancelled_by,cancellation_initiated_by,''))='customer' then 'Customer canceled'
    when lower(coalesce(status,'')) in ('cancelled','canceled') and lower(coalesce(cancelled_by,cancellation_initiated_by,''))='salon' then 'Salon canceled'
    when lower(coalesce(deposit_status,'')) in ('paid','succeeded') then 'Deposit received'
    else financial_status
  end,
  transfer_status = case
    when stripe_transfer_reversal_id is not null then 'Transfer reversed'
    when stripe_transfer_id is not null then 'Transferred to salon'
    else 'Not transferred'
  end,
  payout_status = case
    when lower(coalesce(refund_status,''))='pending' then 'Refund pending'
    when lower(coalesce(refund_status,''))='succeeded'
      and coalesce(refund_amount,0)+0.0001>=coalesce(deposit_amount,0)
      then case when stripe_transfer_reversal_id is not null then 'Transfer reversed' else 'Refunded' end
    else payout_status
  end,
  net_amount_owed_salon = case
    when lower(coalesce(refund_status,''))='pending' then 0
    when lower(coalesce(refund_status,''))='succeeded'
      and coalesce(refund_amount,0)+0.0001>=coalesce(deposit_amount,0) then 0
    else net_amount_owed_salon
  end
where
  lower(coalesce(refund_status,'')) in ('pending','succeeded','partially refunded')
  or lower(coalesce(status,'')) in ('cancelled','canceled')
  or lower(coalesce(deposit_status,'')) in ('paid','succeeded');

create or replace function public.record_booking_financial_event()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='INSERT'
     or row(new.status,new.deposit_status,new.refund_status,new.refund_amount,new.transfer_status,new.payout_status,new.net_amount_owed_salon)
        is distinct from
        row(old.status,old.deposit_status,old.refund_status,old.refund_amount,old.transfer_status,old.payout_status,old.net_amount_owed_salon) then
    insert into public.booking_financial_events(
      booking_id,salon_id,event_type,actor,refund_status,transfer_status,payout_status,
      deposit_amount,refund_amount,net_amount_owed_salon,stripe_refund_id,
      stripe_transfer_id,stripe_transfer_reversal_id
    ) values (
      new.id,new.salon_id,new.financial_status,
      lower(coalesce(new.cancelled_by,new.cancellation_initiated_by,'system')),
      new.refund_status,new.transfer_status,new.payout_status,coalesce(new.deposit_amount,0),
      coalesce(new.refund_amount,0),coalesce(new.net_amount_owed_salon,0),
      new.stripe_refund_id,new.stripe_transfer_id,new.stripe_transfer_reversal_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists record_booking_financial_event on public.bookings;
create trigger record_booking_financial_event
after insert or update of
  status,deposit_status,refund_status,refund_amount,transfer_status,payout_status,net_amount_owed_salon
on public.bookings
for each row execute function public.record_booking_financial_event();

commit;
