begin;

alter table public.bookings
  add column if not exists deposit_percentage numeric(6,3),
  add column if not exists stripe_processing_fee numeric(10,2),
  add column if not exists platform_fee numeric(10,2) not null default 0,
  add column if not exists net_amount_owed_salon numeric(10,2),
  add column if not exists payout_status text not null default 'Not configured',
  add column if not exists stripe_payout_id text,
  add column if not exists payment_verified_at timestamptz;

update public.bookings
set
  deposit_percentage=case
    when estimated_total>0 then round((deposit_amount/estimated_total)*100,3)
    else 0
  end,
  net_amount_owed_salon=greatest(
    0,
    deposit_amount-coalesce(stripe_processing_fee,0)-coalesce(platform_fee,0)
  ),
  payment_verified_at=coalesce(payment_verified_at,created_at)
where lower(coalesce(deposit_status,'')) in ('paid','succeeded','complete','completed')
  and (
    deposit_percentage is null
    or net_amount_owed_salon is null
    or payment_verified_at is null
  );

alter table public.bookings
  drop constraint if exists bookings_deposit_percentage_check;
alter table public.bookings
  add constraint bookings_deposit_percentage_check
  check(deposit_percentage is null or deposit_percentage between 0 and 100);
alter table public.bookings
  drop constraint if exists bookings_finance_nonnegative_check;
alter table public.bookings
  add constraint bookings_finance_nonnegative_check
  check(
    (stripe_processing_fee is null or stripe_processing_fee>=0)
    and platform_fee>=0
    and (net_amount_owed_salon is null or net_amount_owed_salon>=0)
  );

create index if not exists bookings_finance_payment_idx
  on public.bookings(payment_verified_at desc,payment_mode,deposit_status);
create index if not exists bookings_finance_payout_idx
  on public.bookings(payout_status,payment_verified_at desc);

alter table public.subscription_change_requests
  add column if not exists previewed_at timestamptz,
  add column if not exists preview_proration_date bigint,
  add column if not exists tax_amount bigint not null default 0,
  add column if not exists renewal_amount bigint,
  add column if not exists renewal_date timestamptz;

alter table public.stripe_webhook_events
  add column if not exists livemode boolean,
  add column if not exists provider_created_at timestamptz,
  add column if not exists processing_status text not null default 'Processed',
  add column if not exists attempt_count integer not null default 1,
  add column if not exists last_attempt_at timestamptz not null default now(),
  add column if not exists error_reference uuid;

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_processing_status_check;
alter table public.stripe_webhook_events
  add constraint stripe_webhook_processing_status_check
  check(processing_status in ('Processing','Processed','Failed'));
alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_attempt_count_check;
alter table public.stripe_webhook_events
  add constraint stripe_webhook_attempt_count_check check(attempt_count between 1 and 1000);

create index if not exists stripe_webhook_events_status_time_idx
  on public.stripe_webhook_events(processing_status,processed_at desc);

create or replace function public.begin_stripe_webhook_event(
  p_id text,
  p_event_type text,
  p_livemode boolean,
  p_provider_created_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_event public.stripe_webhook_events;
begin
  select * into v_event
  from public.stripe_webhook_events
  where id=p_id
  for update;
  if not found then
    insert into public.stripe_webhook_events(
      id,event_type,livemode,provider_created_at,processing_status,
      attempt_count,last_attempt_at
    ) values(
      p_id,left(p_event_type,160),p_livemode,p_provider_created_at,
      'Processing',1,now()
    );
    return true;
  end if;
  if v_event.processing_status<>'Failed' then
    return false;
  end if;
  update public.stripe_webhook_events
  set
    processing_status='Processing',
    attempt_count=least(attempt_count+1,1000),
    last_attempt_at=now(),
    error_reference=null
  where id=p_id;
  return true;
end;
$$;
revoke all on function public.begin_stripe_webhook_event(
  text,text,boolean,timestamptz
) from public,anon,authenticated;
grant execute on function public.begin_stripe_webhook_event(
  text,text,boolean,timestamptz
) to service_role;

insert into public.engine_settings(
  setting_key,category,display_name,description,value_type,
  draft_value,published_value,status,impact_level,validation,help_text,
  impact_description,is_public,is_secret_status,sort_order,affected_surfaces
)
values
('payments.platform_fee_percentage','payments_plans','Booking platform fee percentage','Marketplace fee withheld from a customer reservation deposit. Girlz Culture currently takes no service cut.','percentage','0','0','Published','billing','{"min":0,"max":100}','Keep at zero unless founder-approved legal and billing terms change.','Affects future booking finance snapshots only; it never rewrites existing paid bookings.',false,false,140,array['Booking checkout','Finance ledger'])
on conflict(setting_key) do nothing;

commit;
