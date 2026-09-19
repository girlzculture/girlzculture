begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table public.business_deposit_rules (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  request_id uuid not null,
  previous_version uuid references public.business_deposit_rules(id),
  rate numeric(5,2) not null check(rate between 0 and 100),
  threshold_amount numeric(10,2), threshold_rate numeric(5,2),
  repeat_incident_count integer, repeat_incident_rate numeric(5,2),
  incident_window_days integer not null default 365 check(incident_window_days between 1 and 730),
  created_at timestamptz not null default clock_timestamp(),
  unique(salon_id,created_by,request_id),
  check((threshold_amount is null and threshold_rate is null) or (threshold_amount is not null and threshold_rate is not null and threshold_amount between 0 and 10000 and threshold_rate between rate and 100)),
  check((repeat_incident_count is null and repeat_incident_rate is null) or (repeat_incident_count is not null and repeat_incident_rate is not null and repeat_incident_count between 1 and 100 and repeat_incident_rate between rate and 100))
);
create index business_deposit_rules_current on public.business_deposit_rules(salon_id,created_at desc,id desc);
alter table public.business_deposit_rules enable row level security;
revoke all on public.business_deposit_rules from public,anon,authenticated,service_role;
grant select on public.business_deposit_rules to service_role;
create view public.current_business_deposit_rules with(security_invoker=true) as
  select distinct on(salon_id) id,salon_id,rate,threshold_amount,threshold_rate,repeat_incident_count,repeat_incident_rate,incident_window_days
  from public.business_deposit_rules order by salon_id,created_at desc,id desc;
revoke all on public.current_business_deposit_rules from public,anon,authenticated;
grant select on public.current_business_deposit_rules to service_role;

create function public.save_business_deposit_rule(p_salon uuid,p_user uuid,p_request uuid,p_expected uuid,p_rule jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_current public.business_deposit_rules%rowtype; v_prior public.business_deposit_rules%rowtype; v_row public.business_deposit_rules%rowtype;
begin
  perform 1 from public.salons where id=p_salon and user_id=p_user for update;
  if not found then raise exception 'DEPOSIT_OWNER_REQUIRED'; end if;
  perform 1 from public.platform_identities where user_id=p_user for share;
  if not public.p0_actor_has_permission(p_salon,p_user,'finance_manage') or not public.p0_business_plan_active(p_salon) then raise exception 'DEPOSIT_ACCESS_DENIED'; end if;
  if p_request is null or p_rule is null or jsonb_typeof(p_rule)<>'object' or octet_length(p_rule::text)>2000
    or exists(select 1 from jsonb_object_keys(p_rule) k where k not in ('rate','threshold_amount','threshold_rate','repeat_incident_count','repeat_incident_rate','incident_window_days'))
    or not (p_rule ?& array['rate','threshold_amount','threshold_rate','repeat_incident_count','repeat_incident_rate','incident_window_days'])
    or exists(select 1 from jsonb_each(p_rule) where value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+(\.[0-9]{1,2})?$'))
    or p_rule->>'repeat_incident_count' is not null and p_rule->>'repeat_incident_count' !~ '^[0-9]+$'
    or p_rule->>'incident_window_days' is null or p_rule->>'incident_window_days' !~ '^[0-9]+$' then raise exception 'DEPOSIT_RULE_INVALID'; end if;
  select * into v_prior from public.business_deposit_rules where salon_id=p_salon and created_by=p_user and request_id=p_request;
  if found then
    if (to_jsonb(v_prior)-array['id','salon_id','created_by','request_id','previous_version','created_at'])<>p_rule or v_prior.previous_version is distinct from p_expected then raise exception 'DEPOSIT_REQUEST_CONFLICT'; end if;
    return to_jsonb(v_prior);
  end if;
  select * into v_current from public.business_deposit_rules where salon_id=p_salon order by created_at desc,id desc limit 1;
  if v_current.id is distinct from p_expected then raise exception 'DEPOSIT_RULE_CHANGED'; end if;
  insert into public.business_deposit_rules(salon_id,created_by,request_id,previous_version,rate,threshold_amount,threshold_rate,repeat_incident_count,repeat_incident_rate,incident_window_days)
  values(p_salon,p_user,p_request,p_expected,(p_rule->>'rate')::numeric,(p_rule->>'threshold_amount')::numeric,(p_rule->>'threshold_rate')::numeric,(p_rule->>'repeat_incident_count')::integer,(p_rule->>'repeat_incident_rate')::numeric,(p_rule->>'incident_window_days')::integer) returning * into v_row;
  return to_jsonb(v_row);
end $$;
revoke all on function public.save_business_deposit_rule(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_business_deposit_rule(uuid,uuid,uuid,uuid,jsonb) to service_role;

-- Incidents belong to the booking's business; no customer-wide risk field is read.
create table public.business_booking_incidents (
  id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  subject_email text,
  kind text not null check(kind in ('no_show','late_cancellation')),
  previous_booking_status text,
  occurred_at timestamptz not null,
  status text not null check(status in ('confirmed','review_requested','voided')),
  evidence text not null check(length(trim(evidence)) between 1 and 1000),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz, review_reason text
);
create index business_booking_incidents_subject on public.business_booking_incidents(salon_id,customer_id,occurred_at) where status='confirmed';
create index business_booking_incidents_email on public.business_booking_incidents(salon_id,subject_email,occurred_at) where status='confirmed';
alter table public.business_booking_incidents enable row level security;
revoke all on public.business_booking_incidents from public,anon,authenticated,service_role;
grant select on public.business_booking_incidents to service_role;
create table public.business_booking_incident_events (
  id uuid primary key default gen_random_uuid(),salon_id uuid not null references public.salons(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,actor_id uuid references auth.users(id),
  guest_token_id uuid references public.booking_guest_access_tokens(id) on delete set null,
  request_id uuid not null,action text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
  unique(salon_id,actor_id,request_id)
);
alter table public.business_booking_incident_events enable row level security;
revoke all on public.business_booking_incident_events from public,anon,authenticated,service_role;
grant select on public.business_booking_incident_events to service_role;

create function public.record_business_booking_incident(p_salon uuid,p_user uuid,p_booking uuid,p_request uuid,p_action text,p_kind text,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype; i public.business_booking_incidents%rowtype; previous public.business_booking_incident_events%rowtype; input jsonb; result jsonb; status_key text;
begin
  perform 1 from public.salons where id=p_salon for update;
  perform 1 from public.platform_identities where user_id=p_user for share;
  perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_user for share;
  if not public.p0_actor_has_permission(p_salon,p_user,'bookings') or not public.p0_business_plan_active(p_salon) then raise exception 'INCIDENT_ACCESS_DENIED'; end if;
  if p_request is null or p_action is null or p_action not in ('confirm','void','reinstate') or p_reason is null or length(trim(p_reason)) not between 1 and 1000 then raise exception 'INCIDENT_INVALID'; end if;
  select * into b from public.bookings where id=p_booking and salon_id=p_salon for update;
  if not found then raise exception 'INCIDENT_BOOKING_NOT_FOUND'; end if;
  if not exists(select 1 from public.salons where id=p_salon and user_id=p_user)
    and exists(select 1 from public.salon_team_members where salon_id=p_salon and user_id=p_user and status='Active' and stylist_id is not null and stylist_id is distinct from b.stylist_id)
    then raise exception 'INCIDENT_ACCESS_DENIED'; end if;
  input:=jsonb_build_object('booking_id',p_booking,'kind',p_kind,'reason',trim(p_reason));
  select * into previous from public.business_booking_incident_events where salon_id=p_salon and actor_id=p_user and request_id=p_request;
  if found then
    if previous.action<>p_action or previous.payload<>input then raise exception 'INCIDENT_REQUEST_CONFLICT'; end if;
    return previous.result;
  end if;
  select * into i from public.business_booking_incidents where salon_id=p_salon and booking_id=p_booking for update;
  if p_action='confirm' then
    if i.id is not null then raise exception 'INCIDENT_ALREADY_RECORDED'; end if;
    if p_kind is null or p_kind not in ('no_show','late_cancellation') then raise exception 'INCIDENT_INVALID'; end if;
    status_key:=regexp_replace(lower(b.status),'[ _-]','','g');
    if p_kind='no_show' then
      if b.appointment_datetime + b.duration_hours * interval '1 hour' > now() or status_key not in ('confirmed','arrivingsoon','noshow') or b.service_started_at is not null then raise exception 'INCIDENT_NOT_VERIFIED'; end if;
      update public.bookings set status='No Show' where id=b.id;
    else
      if status_key not in ('cancelled','canceled') or lower(coalesce(b.cancelled_by,b.cancellation_initiated_by,''))<>'customer' or b.cancelled_at is null or b.cancellation_notice_minutes is null
        or nullif(b.business_policy_snapshot->>'cancellation_hours','') is null
        or b.cancellation_notice_minutes >= (b.business_policy_snapshot->>'cancellation_hours')::numeric * 60 then raise exception 'INCIDENT_NOT_VERIFIED'; end if;
    end if;
    insert into public.business_booking_incidents(salon_id,booking_id,customer_id,subject_email,kind,previous_booking_status,occurred_at,status,evidence,created_by)
      values(p_salon,b.id,b.customer_id,lower(nullif(trim(b.guest_email),'')),p_kind,b.status,case p_kind when 'no_show' then b.appointment_datetime else b.cancelled_at end,'confirmed',trim(p_reason),p_user) returning * into i;
  else
    if i.id is null then raise exception 'INCIDENT_BOOKING_NOT_FOUND'; end if;
    if i.kind='no_show' then
      if p_action='void' and b.status='No Show' then
        update public.bookings set status=case when regexp_replace(lower(coalesce(i.previous_booking_status,'')),'[ _-]','','g')='noshow' then 'Confirmed' else coalesce(i.previous_booking_status,'Confirmed') end where id=b.id;
      elsif p_action='reinstate' then
        if regexp_replace(lower(b.status),'[ _-]','','g') not in ('confirmed','arrivingsoon','noshow') or b.service_started_at is not null then raise exception 'INCIDENT_NOT_VERIFIED'; end if;
        update public.bookings set status='No Show' where id=b.id;
      end if;
    end if;
    -- Corrections retain the original evidence and every review event.
    update public.business_booking_incidents set status=case p_action when 'void' then 'voided' else 'confirmed' end,reviewed_by=p_user,reviewed_at=now(),review_reason=trim(p_reason) where id=i.id returning * into i;
  end if;
  result:=jsonb_build_object('id',i.id,'booking_id',b.id,'kind',i.kind,'status',i.status,'booking_status',(select status from public.bookings where id=b.id),'verified',true);
  insert into public.business_booking_incident_events(salon_id,booking_id,actor_id,request_id,action,payload,result) values(p_salon,b.id,p_user,p_request,p_action,input,result);
  return result;
end $$;
revoke all on function public.record_business_booking_incident(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_business_booking_incident(uuid,uuid,uuid,uuid,text,text,text) to service_role;

create function public.request_booking_incident_review(p_user uuid,p_booking uuid,p_reason text,p_guest_token uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.business_booking_incidents%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) not between 1 and 1000 then raise exception 'INCIDENT_INVALID'; end if;
  perform 1 from public.bookings b where b.id=p_booking and (
    exists(select 1 from auth.users u where u.id=p_user and (b.customer_id=p_user or (u.email_confirmed_at is not null and lower(u.email)=lower(b.guest_email))))
    or (p_user is null and exists(select 1 from public.booking_guest_access_tokens t where t.id=p_guest_token and t.booking_id=b.id and t.purpose='manage' and t.revoked_at is null and t.expires_at>now())));
  if not found then raise exception 'INCIDENT_BOOKING_NOT_FOUND'; end if;
  select * into i from public.business_booking_incidents where booking_id=p_booking for update;
  if not found then raise exception 'INCIDENT_BOOKING_NOT_FOUND'; end if;
  if i.status='confirmed' then
    update public.business_booking_incidents set status='review_requested',review_reason=trim(p_reason),reviewed_at=now(),reviewed_by=p_user where id=i.id;
    insert into public.business_booking_incident_events(salon_id,booking_id,actor_id,guest_token_id,request_id,action,payload,result)
      values(i.salon_id,i.booking_id,p_user,p_guest_token,gen_random_uuid(),'request_review',jsonb_build_object('reason',trim(p_reason)),jsonb_build_object('status','review_requested'));
  end if;
  return jsonb_build_object('status',case when i.status='confirmed' then 'review_requested' else i.status end,'verified',true);
end $$;
revoke all on function public.request_booking_incident_review(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.request_booking_incident_review(uuid,uuid,text,uuid) to service_role;

create function public.own_business_incident_count(p_salon uuid,p_customer uuid,p_verified_email text,p_days integer)
returns integer language sql stable security definer set search_path=pg_catalog,public as $$
  select count(*)::integer from public.business_booking_incidents i
  join public.bookings b on b.id=i.booking_id and b.salon_id=i.salon_id
  where i.salon_id=p_salon and i.status='confirmed' and i.occurred_at>=now()-make_interval(days=>least(730,greatest(1,p_days)))
    and p_customer is not null and (i.customer_id=p_customer or (p_verified_email is not null and i.subject_email=lower(trim(p_verified_email))))
$$;
revoke all on function public.own_business_incident_count(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.own_business_incident_count(uuid,uuid,text,integer) to service_role;

alter table public.bookings add column deposit_rule_snapshot jsonb;
create function public.preserve_business_deposit_snapshot()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_payload jsonb;
begin
  if tg_op='UPDATE' then
    if new.deposit_rule_snapshot is distinct from old.deposit_rule_snapshot then raise exception 'DEPOSIT_SNAPSHOT_IMMUTABLE'; end if;
    return new;
  end if;
  if new.origin_checkout_intent_id is not null then
    select payload into v_payload from public.booking_checkout_intents where id=new.origin_checkout_intent_id and salon_id=new.salon_id;
    if v_payload ? 'deposit_rule_snapshot' then
      new.deposit_rule_snapshot:=v_payload->'deposit_rule_snapshot';
      if new.deposit_amount is distinct from (v_payload->>'deposit_amount')::numeric
        or new.estimated_total is distinct from (v_payload->>'estimated_total')::numeric
        or new.balance_due is distinct from (v_payload->>'balance_due')::numeric
        or new.deposit_amount is distinct from (new.deposit_rule_snapshot->>'deposit')::numeric then raise exception 'DEPOSIT_SNAPSHOT_MISMATCH'; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.preserve_business_deposit_snapshot() from public,anon,authenticated;
create trigger preserve_business_deposit_snapshot before insert or update on public.bookings for each row execute function public.preserve_business_deposit_snapshot();

-- A service-wide offer cannot become a product discount through a forged API call.
-- Existing intents retain their accepted snapshots. New product offers are explicit.
create function public.check_product_promotion_scope()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.product_promotion_id is not null and not exists(select 1 from public.salon_promotions where id=new.product_promotion_id and salon_id=new.salon_id and target_scope='products') then raise exception 'PRODUCT_PROMOTION_NOT_APPLICABLE'; end if;
  return new;
end $$;
revoke all on function public.check_product_promotion_scope() from public,anon,authenticated;
create trigger check_product_promotion_scope before insert on public.commerce_checkout_intents for each row execute function public.check_product_promotion_scope();

update public.engine_settings set published_value='"20260918072308"'::jsonb,draft_value='"20260918072308"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
