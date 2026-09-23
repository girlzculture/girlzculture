-- Sample businesses are explicit, private tenants, never simulated provider activity.
-- This migration creates controls only. Provisioning and seeding are separate guarded actions.
begin;
alter table public.salons add column is_demo boolean not null default false;
create table gc_private.demo_workspaces(
 salon_id uuid primary key references public.salons(id) on delete restrict,
 owner_id uuid not null unique references auth.users(id) on delete restrict,
 seed_version integer not null default 1,
 anchor_date date not null,
 seeded_at timestamptz,
 created_at timestamptz not null default now(),
 check(seed_version>0)
);
revoke all on gc_private.demo_workspaces from public,anon,authenticated;
grant select,insert,update on gc_private.demo_workspaces to service_role;

create function gc_private.demo_actor(p_user uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,auth as $$
 select exists(select 1 from auth.users where id=p_user and raw_app_meta_data->>'gc_demo'='true');
$$;
revoke all on function gc_private.demo_actor(uuid) from public,anon,authenticated;
grant execute on function gc_private.demo_actor(uuid) to service_role;
create function public.demo_row_visible(p_salon uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public,auth as $$
 select exists(select 1 from public.salons s where s.id=p_salon and
  (s.user_id=auth.uid() or exists(select 1 from public.salon_team_members m
   where m.salon_id=s.id and m.user_id=auth.uid() and m.status='Active')));
$$;
revoke all on function public.demo_row_visible(uuid) from public;
grant execute on function public.demo_row_visible(uuid) to anon,authenticated,service_role;

create function gc_private.guard_demo_salon() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,gc_private as $$
begin
 if TG_OP='UPDATE' and (new.is_demo is distinct from old.is_demo or old.is_demo and new.user_id is distinct from old.user_id) then
  raise exception 'DEMO_CLASSIFICATION_IMMUTABLE';
 end if;
 if new.is_demo then
  if not gc_private.demo_actor(new.user_id) then raise exception 'DEMO_OWNER_REQUIRED';end if;
  if new.email is not null and new.email !~* '@[a-z0-9.-]+\.invalid$' then raise exception 'DEMO_CONTACT_ONLY';end if;
  if nullif(new.phone,'') is not null and new.phone !~ '^\+1[2-9][0-9]{2}55501[0-9]{2}$' then raise exception 'DEMO_CONTACT_ONLY';end if;
  if nullif(new.stripe_account_id,'') is not null then raise exception 'DEMO_PROVIDER_ACTION_DISABLED';end if;
  new.is_discoverable=false;new.accepting_bookings=false;
 end if;
 return new;
end;$$;
revoke all on function gc_private.guard_demo_salon() from public,anon,authenticated;
-- Validate sample identities before general identity triggers; reassert private visibility after platform projections.
create trigger aaa_demo_salon_guard before insert or update on public.salons for each row execute function gc_private.guard_demo_salon();
create trigger zzz_demo_salon_guard before insert or update on public.salons for each row execute function gc_private.guard_demo_salon();
create policy demo_private_tenant on public.salons as restrictive for select to anon,authenticated using(not is_demo or public.demo_row_visible(id));

create function gc_private.guard_demo_record() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,auth,gc_private as $$
declare v_demo boolean;v jsonb;v_key text;v_value text;v_foreign_salon uuid;
begin
 select is_demo into v_demo from public.salons where id=new.salon_id;
 v_demo=coalesce(v_demo,false);
 if TG_OP='UPDATE' then
  if (old.is_demo or v_demo) and old.salon_id is distinct from new.salon_id then raise exception 'BUSINESS_SCOPE_IMMUTABLE';end if;
  if old.is_demo is distinct from v_demo then raise exception 'DEMO_CLASSIFICATION_IMMUTABLE';end if;
 end if;
 new.is_demo=v_demo;
 v=to_jsonb(new);
 if not v_demo then
  for v_key,v_value in select key,value from jsonb_each_text(v) loop
   if v_key=any(array['user_id','customer_id','sender_user_id']) and v_value is not null and gc_private.demo_actor(v_value::uuid) then raise exception 'DEMO_IDENTITY_BOUNDARY';end if;
  end loop;
  return new;
 end if;
 if TG_TABLE_NAME='notifications' and v->>'channel'<>'in_app' then raise exception 'DEMO_EXTERNAL_NOTIFICATION_DISABLED';end if;
 for v_key,v_value in select key,value from jsonb_each_text(v) loop
  if v_key like 'stripe_%' and nullif(v_value,'') is not null and not (TG_TABLE_NAME='billing_events' and v_key='stripe_event_id' and v_value like 'gc-demo:%') then raise exception 'DEMO_PROVIDER_ACTION_DISABLED';end if;
  if v_key like '%email' and nullif(v_value,'') is not null and v_value !~* '@[a-z0-9.-]+\.invalid$' then raise exception 'DEMO_CONTACT_ONLY';end if;
  if v_key like '%phone' and nullif(v_value,'') is not null and v_value !~ '^\+1[2-9][0-9]{2}55501[0-9]{2}$' then raise exception 'DEMO_CONTACT_ONLY';end if;
  if v_key=any(array['user_id','customer_id','sender_user_id']) and v_value is not null and not gc_private.demo_actor(v_value::uuid) then raise exception 'DEMO_IDENTITY_BOUNDARY';end if;
  if v_key=any(array['booking_id','stylist_id','style_id','product_id']) and v_value is not null then
   execute format('select salon_id from public.%I where id=$1',case v_key when 'booking_id' then 'bookings' when 'stylist_id' then 'stylists' when 'style_id' then 'styles' else 'salon_products' end) into v_foreign_salon using v_value::uuid;
   if v_foreign_salon is distinct from new.salon_id then raise exception 'DEMO_RECORD_BOUNDARY';end if;
  end if;
 end loop;
 return new;
end;$$;
revoke all on function gc_private.guard_demo_record() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['stylists','styles','salon_team_members','salon_products','salon_promotions','bookings','reviews','subscriptions','product_orders','product_order_refunds','billing_events','subscription_change_requests','business_finance_sales','business_finance_receipts','business_finance_expenses','business_compensation_arrangements','business_compensation_obligations','business_compensation_payments','business_stock_movements','business_client_cards','business_client_formulas','booking_messages','notifications','appointment_waitlist','salon_blockouts','business_policy_revisions','business_client_events','business_client_photos','business_communication_preferences'] loop
  execute format('alter table public.%I add column is_demo boolean not null default false',t);
  execute format('create trigger aaa_demo_record_guard before insert or update on public.%I for each row execute function gc_private.guard_demo_record()',t);
  -- Reviews deliberately have no browser SELECT policy; all access is server-scoped.
  if t<>'reviews' then
  execute format('create policy demo_private_records on public.%I as restrictive for select to anon,authenticated using(not is_demo or public.demo_row_visible(salon_id))',t);
  end if;
 end loop;
end;$$;
-- Public discovery already excludes registered test tenants. Keep that classification
-- automatically attached, outside the generic cleanup registry's editable lifecycle.
create function gc_private.register_demo_tenant() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,gc_private as $$
declare v_batch uuid;
begin
 if not new.is_demo then return new;end if;
 insert into public.test_data_batches(name,environment) values('Girlz Culture private demo','production') on conflict(name) do update set name=excluded.name returning id into v_batch;
 insert into public.test_data_registry(batch_id,record_type,record_id,record_label,metadata)
 values(v_batch,'salon',new.id::text,'Private sample business','{"sample":true,"purpose":"owner_demo"}') on conflict(record_type,record_id) do nothing;
 insert into gc_private.demo_workspaces(salon_id,owner_id,anchor_date)values(new.id,new.user_id,current_date) on conflict(salon_id)do nothing;
 return new;
end;$$;
revoke all on function gc_private.register_demo_tenant() from public,anon,authenticated;
create trigger demo_tenant_registry after insert on public.salons for each row execute function gc_private.register_demo_tenant();
-- Service-only identity list for suppressing external push delivery. No credentials.
create function public.demo_delivery_actor_ids(p_users uuid[]) returns uuid[]
language sql stable security definer set search_path=pg_catalog,auth as $$
 select coalesce(array_agg(id),'{}'::uuid[]) from auth.users where id=any(p_users) and raw_app_meta_data->>'gc_demo'='true';
$$;
revoke all on function public.demo_delivery_actor_ids(uuid[]) from public,anon,authenticated;
grant execute on function public.demo_delivery_actor_ids(uuid[]) to service_role;

create function gc_private.guard_demo_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if TG_OP='UPDATE' and old.raw_app_meta_data->>'gc_demo'='true' and new.raw_app_meta_data->>'gc_demo' is distinct from 'true' then raise exception 'DEMO_CLASSIFICATION_IMMUTABLE';end if;
 if new.raw_app_meta_data->>'gc_demo'='true' and (new.email !~* '@[a-z0-9.-]+\.invalid$' or nullif(to_jsonb(new)->>'phone','') is not null) then raise exception 'DEMO_CONTACT_ONLY';end if;
 return new;
end;$$;
revoke all on function gc_private.guard_demo_identity() from public,anon,authenticated;
create trigger guard_demo_identity before insert or update on auth.users for each row execute function gc_private.guard_demo_identity();
alter table public.customers add column is_demo boolean not null default false;
create function gc_private.guard_demo_customer() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,gc_private as $$
begin
 new.is_demo=gc_private.demo_actor(new.id);
 if new.is_demo then
  if new.email !~* '@[a-z0-9.-]+\.invalid$' or (nullif(new.phone,'') is not null and new.phone !~ '^\+1[2-9][0-9]{2}55501[0-9]{2}$') then raise exception 'DEMO_CONTACT_ONLY';end if;
 end if;
 return new;
end;$$;
revoke all on function gc_private.guard_demo_customer() from public,anon,authenticated;
create trigger aaa_demo_customer_guard before insert or update on public.customers for each row execute function gc_private.guard_demo_customer();
create policy demo_private_customers on public.customers as restrictive for select to anon,authenticated using(not is_demo or id=auth.uid());

create or replace function public.platform_admin_overview_metrics()
returns table (
  total_salons bigint,
  active_salons bigint,
  pending_submissions bigint,
  total_customers bigint,
  total_bookings bigint,
  completed_booking_value numeric,
  deposits_collected numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    (
      select count(*)
      from public.salons salon
      where not salon.is_demo and salon.deleted_at is null
    )::bigint as total_salons,
    (
      select count(*)
      from public.salons salon
      where not salon.is_demo and salon.deleted_at is null
        and salon.status = 'Active'
    )::bigint as active_salons,
    (
      select count(*)
      from public.salon_applications application
      where application.status = 'Pending'
        and application.archived_at is null
    )::bigint as pending_submissions,
    (
      select count(*)
      from public.customers where not is_demo
    )::bigint as total_customers,
    (
      select count(*)
      from public.bookings where not is_demo and booking_origin='marketplace'
    )::bigint as total_bookings,
    (
      select coalesce(sum(booking.estimated_total), 0)::numeric
      from public.bookings booking
      where not booking.is_demo and booking.booking_origin='marketplace' and lower(coalesce(booking.status, '')) = 'completed'
    ) as completed_booking_value,
    (
      select coalesce(sum(booking.deposit_amount), 0)::numeric
      from public.bookings booking
      where not booking.is_demo and booking.booking_origin='marketplace' and lower(coalesce(booking.deposit_status, ''))
        in ('paid', 'succeeded', 'complete', 'completed')
        and booking.payment_verified_at is not null
    ) as deposits_collected;
$$;

create function gc_private.demo_record_id(p_scope uuid,p_kind text,p_number integer) returns uuid language sql immutable set search_path=pg_catalog as $$
 select overlay(overlay(md5(p_scope::text||':'||p_kind||':'||p_number::text) placing '4' from 13) placing 'a' from 17)::uuid;
$$;
revoke all on function gc_private.demo_record_id(uuid,text,integer) from public,anon,authenticated;

-- Preserve authorization and receipt proof; expose the protected sample marker in owner books.
create or replace function public.read_business_finance(p_salon uuid,p_user uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_scope jsonb; v_stylist uuid; v_result jsonb; v_count bigint;
begin
  perform 1 from public.platform_identities where user_id=p_user for share;
  perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_user for share;
  v_scope:=public.business_finance_scope(p_salon,p_user); v_stylist:=(v_scope->>'stylist_id')::uuid;
  select jsonb_build_object(
    'scope',v_scope,'is_demo',(select is_demo from public.salons where id=p_salon),
    'sales',coalesce((select jsonb_agg((to_jsonb(s)-'created_by')||case when v_stylist is null then '{}'::jsonb else '{"cost_cents":null,"client_name":null}'::jsonb end) from public.business_finance_sales s where s.salon_id=p_salon and (v_stylist is null or s.stylist_id=v_stylist)),'[]'),
    'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'salon_id',b.salon_id,'stylist_id',b.stylist_id,'customer_id',case when v_stylist is null then b.customer_id else null end,'guest_name',case when v_stylist is null then b.guest_name else null end,
      'name',coalesce(b.manual_service_name,s.name,'Service'),'created_at',b.created_at,'appointment_datetime',b.appointment_datetime,'service_completed_at',b.service_completed_at,'status',b.status,
      'booking_origin',b.booking_origin,'source',b.source,'estimated_total',b.estimated_total,'subtotal_before_promotion',b.subtotal_before_promotion,'deposit_amount',b.deposit_amount,
      'deposit_status',b.deposit_status,'is_demo',b.is_demo,'payment_mode',b.payment_mode,'payment_verified_at',b.payment_verified_at,'verified_charge',coalesce(b.stripe_charge_id like 'ch_%',false),
      'refund_status',b.refund_status,'refund_amount',b.refund_amount,'refund_completed_at',b.refund_completed_at,'verified_refund',coalesce(b.stripe_refund_id like 're_%',false),'operating_compensation',b.operating_compensation))
      from public.bookings b left join public.styles s on s.id=b.style_id and s.salon_id=b.salon_id where b.salon_id=p_salon and (v_stylist is null or b.stylist_id=v_stylist)),'[]'),
    'receipts',coalesce((select jsonb_agg(to_jsonb(r)-'created_by'-'note') from public.business_finance_receipts r where r.salon_id=p_salon and (v_stylist is null
      or exists(select 1 from public.business_finance_sales s where s.salon_id=p_salon and s.id=r.sale_id and s.stylist_id=v_stylist)
      or exists(select 1 from public.bookings b where b.salon_id=p_salon and b.id=r.booking_id and b.stylist_id=v_stylist))),'[]'),
    'expenses',case when v_stylist is null then coalesce((select jsonb_agg(to_jsonb(e)-'created_by') from public.business_finance_expenses e where e.salon_id=p_salon),'[]') else '[]' end,
    'arrangements',coalesce((select jsonb_agg(to_jsonb(a)-'created_by') from public.business_compensation_arrangements a where a.salon_id=p_salon and (v_stylist is null or a.stylist_id=v_stylist)),'[]'),
    'obligations',coalesce((select jsonb_agg(to_jsonb(o)-'created_by') from public.business_compensation_obligations o where o.salon_id=p_salon and (v_stylist is null or o.stylist_id=v_stylist)),'[]'),
    'compensation_payments',coalesce((select jsonb_agg(to_jsonb(p)-'created_by') from public.business_compensation_payments p where p.salon_id=p_salon and (v_stylist is null or p.stylist_id=v_stylist)),'[]'),
    'stylists',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'salon_id',s.salon_id,'name',s.name)) from public.stylists s where s.salon_id=p_salon and (v_stylist is null or s.id=v_stylist)),'[]'),
    'product_orders',case when v_stylist is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'salon_id',o.salon_id,'public_reference',o.public_reference,'customer_id',o.customer_id,'guest_name',o.guest_name,
      'created_at',o.created_at,'fulfilled_at',o.fulfilled_at,'paid_at',o.paid_at,'fulfillment_status',o.fulfillment_status,'reservation_status',o.reservation_status,
      'subtotal',o.subtotal,'discount_amount',o.discount_amount,'tax_amount',o.tax_amount,'shipping_amount',o.shipping_amount,'total_amount',o.total_amount,'currency',o.currency,
      'deposit_amount',o.deposit_amount,'payment_status',o.payment_status,'payment_mode',o.payment_mode,'verified_charge',coalesce(o.stripe_charge_id like 'ch_%',false),
      'items',(select coalesce(jsonb_agg(jsonb_build_object('product_name',i.product_name,'quantity',i.quantity,'unit_price',i.unit_price,'line_total',i.line_total)),'[]') from public.product_order_items i where i.order_id=o.id)
    )) from public.product_orders o where o.salon_id=p_salon),'[]') end,
    'product_refunds',case when v_stylist is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'salon_id',r.salon_id,'order_id',r.order_id,'amount',r.amount,'status',r.status,'completed_at',r.completed_at,'verified_refund',coalesce(r.stripe_refund_id like 're_%',false)
    )) from public.product_order_refunds r join public.product_orders o on o.id=r.order_id and o.salon_id=r.salon_id where r.salon_id=p_salon),'[]') end
  ) into v_result;
  select sum(jsonb_array_length(value)) into v_count from jsonb_each(v_result) where jsonb_typeof(value)='array';
  if v_count>100000 then raise exception 'FINANCE_RANGE_TOO_LARGE'; end if;
  return v_result;
end $$;

create function gc_private.guard_demo_registry() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if old.record_type='salon' and exists(select 1 from public.salons where id::text=old.record_id and is_demo)
  and (TG_OP='DELETE' or (new.record_type,new.record_id) is distinct from (old.record_type,old.record_id)) then raise exception 'DEMO_CLASSIFICATION_IMMUTABLE';end if;
 if TG_OP='DELETE' then return old;else return new;end if;
end;$$;
revoke all on function gc_private.guard_demo_registry() from public,anon,authenticated;
create trigger guard_demo_registry before delete or update on public.test_data_registry for each row execute function gc_private.guard_demo_registry();

create or replace function gc_private.enqueue_booking_followup() returns trigger
language plpgsql security definer set search_path='' as $$
declare visit_end timestamptz;
begin
 if new.is_demo or new.status<>'Completed' or new.booking_origin<>'marketplace' or new.duration_hours is null or new.duration_hours<=0 then return new;end if;
 if tg_op='UPDATE' and old.status='Completed' and old.schedule_revision=new.schedule_revision then return new;end if;
 visit_end:=new.appointment_datetime+pg_catalog.make_interval(secs=>(new.duration_hours*3600)::integer);
 if visit_end+interval '72 hours'<=now() then return new;end if;
 insert into public.booking_followup_queue(booking_id,schedule_revision,due_at,expires_at)
 values(new.id,new.schedule_revision,visit_end+interval '24 hours',visit_end+interval '72 hours')
 on conflict(booking_id) do update set schedule_revision=excluded.schedule_revision,due_at=excluded.due_at,
 expires_at=excluded.expires_at,attempts=0,lease_id=null,lease_until=null,next_attempt_at=null,failure_reference=null
 where booking_followup_queue.status='pending';
 return new;
end $$;
create or replace function public.claim_notification_delivery(p_booking_id uuid,p_event_type text,p_recipient_type text,p_channel text,p_destination text,p_deduplication_key text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype;pref public.business_communication_preferences%rowtype;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or b.is_demo then return null;end if;
 if p_recipient_type='customer' then
  select * into pref from public.business_communication_preferences where salon_id=b.salon_id and (guest_booking_id=b.id or customer_id=b.customer_id) order by (guest_booking_id is not null) desc limit 1 for share;
  if p_channel='email' and not coalesce(pref.email_enabled,true) or p_channel='sms' and not coalesce(pref.sms_enabled,true) or p_channel='push' and not coalesce(pref.push_enabled,true) then return null;end if;
  if p_event_type like 'booking_reminder_%' and (not coalesce(pref.reminders,true) or b.status<>'Confirmed') then return null;end if;
  if p_event_type='booking_follow_up' and (not coalesce(pref.follow_up,false) or b.status<>'Completed' or b.duration_hours is null or b.duration_hours<=0 or b.appointment_datetime+make_interval(secs=>(b.duration_hours*3600)::integer)>now()) then return null;end if;
  if p_event_type like 'business_campaign:%' and not coalesce(pref.marketing,false) then return null;end if;
 end if;
 return public.claim_notification_delivery_without_preferences(p_booking_id,p_event_type,p_recipient_type,p_channel,p_destination,p_deduplication_key);
end $$;

create or replace function public.due_booking_reminders(p_reminder_hours integer)
returns table(id uuid,appointment_datetime timestamptz,schedule_revision integer)
language sql stable security definer set search_path=pg_catalog,public as $$
 select b.id,b.appointment_datetime,b.schedule_revision from public.bookings b
 left join public.booking_reminder_claims c on c.booking_id=b.id and c.reminder_hours=p_reminder_hours and c.schedule_revision=b.schedule_revision
 where not b.is_demo and p_reminder_hours between 1 and 336 and b.status='Confirmed' and b.booking_origin='marketplace'
 and b.appointment_datetime>=now()+make_interval(hours=>p_reminder_hours)-interval '30 minutes'
 and b.appointment_datetime<now()+make_interval(hours=>p_reminder_hours)+interval '20 minutes'
 and (c.booking_id is null or (c.completed_at is null and c.terminal_at is null and c.attempt_count<3
 and ((c.error_message is not null and coalesce(c.next_attempt_at,c.claimed_at)<=now())
 or (c.error_message is null and coalesce(c.lease_expires_at,c.claimed_at+interval '5 minutes')<=now()))))
 order by b.appointment_datetime,b.id limit 250;
$$;


-- A private sample must never acquire external account credentials, including
-- through callbacks, direct service calls, or a background synchronization job.
create function gc_private.reject_demo_provider_connection() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.salons where id=new.salon_id and is_demo) then
  raise exception 'DEMO_PROVIDER_ACTION_DISABLED';
 end if;
 return new;
end;$$;
revoke all on function gc_private.reject_demo_provider_connection() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['business_google_connections','business_google_oauth_flows','business_google_sync_operations','business_instagram_connections','business_instagram_oauth_flows','business_instagram_imports','business_instagram_import_assets'] loop
  execute format('create trigger aaa_demo_provider_guard before insert or update on public.%I for each row execute function gc_private.reject_demo_provider_connection()',t);
 end loop;
end;$$;

-- A sample marker is metadata, not an array or a change in actual cost evidence.
-- Preserve genuine-business fingerprints when the marker is added to finance rows.
create or replace function public.read_service_contribution_evidence(p_salon uuid,p_actor uuid,p_from date,p_to date) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.salons%rowtype;fin jsonb;normalized jsonb;services jsonb;mapping jsonb;reviews jsonb;fingerprint text;total integer;
begin
 if not public.p0_actor_has_permission(p_salon,p_actor,'earnings') or not public.p0_actor_has_permission(p_salon,p_actor,'bookings') or not public.p0_actor_has_permission(p_salon,p_actor,'styles') or not public.p0_business_plan_active(p_salon) then raise exception 'CONTRIBUTION_ACCESS_DENIED';end if;
 select * into s from public.salons where id=p_salon;
 if not found or not exists(select 1 from pg_catalog.pg_timezone_names where name=s.time_zone) then raise exception 'CONTRIBUTION_ACCESS_DENIED';end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from or p_to-p_from>=366 or p_to>=(now() at time zone s.time_zone)::date then raise exception 'CONTRIBUTION_INVALID_PERIOD';end if;
 fin:=public.read_business_finance(p_salon,p_actor);
 if fin->'scope'->>'kind'<>'business' then raise exception 'CONTRIBUTION_ACCESS_DENIED';end if;
 select coalesce(sum(jsonb_array_length(value)),0) into total from jsonb_each(fin) where key not in ('scope','is_demo');
 if total>20000 or jsonb_array_length(fin->'bookings')>5000 then raise exception 'CONTRIBUTION_EVIDENCE_INCOMPLETE';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'salon_id',salon_id,'name',name) order by id),'[]') into services from public.styles where salon_id=p_salon;
 if jsonb_array_length(services)>200 then raise exception 'CONTRIBUTION_EVIDENCE_INCOMPLETE';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'salon_id',b.salon_id,'style_id',b.style_id) order by b.id),'[]') into mapping
 from public.bookings b where b.salon_id=p_salon and exists(select 1 from jsonb_array_elements(fin->'bookings') x where x->>'id'=b.id::text);
 if jsonb_array_length(mapping)<>jsonb_array_length(fin->'bookings') then raise exception 'CONTRIBUTION_EVIDENCE_INCOMPLETE';end if;
 -- Stable row ordering; no private financial projection is sent to the browser.
 select jsonb_object_agg(key,case when key='scope' then value else (select coalesce(jsonb_agg(item-'is_demo' order by item->>'id',item::text),'[]') from jsonb_array_elements(value)item) end) into normalized from jsonb_each(fin) where key<>'is_demo';
 fingerprint:=md5(jsonb_build_object('from',p_from,'to',p_to,'zone',s.time_zone,'finance',normalized,'services',services,'mapping',mapping)::text);
 select coalesce(jsonb_agg(jsonb_build_object('service_id',service_id,'revision',revision,'fingerprint',r.fingerprint,'complete',complete,'zero_confirmed',zero_confirmed,'allocations',allocations,'note',note) order by service_id),'[]') into reviews
 from public.business_service_cost_reviews r where salon_id=p_salon and period_from=p_from and period_to=p_to;
 return jsonb_build_object('salon_id',p_salon,'period',jsonb_build_object('from',p_from,'to',p_to,'timeZone',s.time_zone),'as_of',now(),'fingerprint',fingerprint,'finance',fin,'services',services,'booking_services',mapping,'reviews',reviews);
end $$;


-- BEGIN PRIVATE DEMO PROCEDURES
-- Installed only by the protected migration; invocation is a separate, explicit admin action.
create or replace function public.seed_private_demo(p_salon uuid,p_owner uuid,p_anchor date)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth,gc_private as $$
declare
 w gc_private.demo_workspaces%rowtype;v_start date;v_now timestamptz;v_day date;v_at timestamptz;
 i integer;j integer;m integer;k integer;v_style uuid;v_staff uuid;v_client uuid;v_booking uuid;v_receipt uuid;v_sale uuid;
 v_deposit_id uuid;v_price numeric;v_hours numeric;v_status text;v_plan text;v_count integer;
 v_photos jsonb='["https://girlzculture.com/images/salon-warm.jpg","https://girlzculture.com/images/salon-modern.jpg","https://girlzculture.com/images/salon-dark.jpg","https://girlzculture.com/images/salon-blush.jpg","https://girlzculture.com/images/hero-braids.jpg","https://girlzculture.com/images/braids-box.jpg","https://girlzculture.com/images/braids-cornrows.jpg","https://girlzculture.com/images/braids-knotless.jpg"]';
 v_names text[]=array['Amara Demo','Nia Demo','Zuri Demo','Imani Demo'];
 v_services text[]=array['Boho / Knotless Braids','Box Braids','Loc Retwist','Cornrows','Two-Strand Twists','Feed-in Braids'];
 v_canonical text[]=array['Knotless Braids','Box Braids','Locs','Cornrows','Two-Strand Twists','Feed-in Braids'];
 v_products text[]=array['Sample moisture shampoo','Sample leave-in conditioner','Sample scalp oil','Sample satin bonnet'];
 v_prices numeric[]=array[210,95,110,125,55,65];
 v_durations numeric[]=array[4,2,2,3,1,1];
 v_master public.master_styles%rowtype;
begin
 if p_anchor>current_date or p_anchor<current_date-31 then raise exception 'DEMO_ANCHOR_INVALID';end if;
 select * into w from gc_private.demo_workspaces where salon_id=p_salon and owner_id=p_owner for update;
 if not found or not gc_private.demo_actor(p_owner) or not exists(select 1 from public.salons where id=p_salon and user_id=p_owner and is_demo) then raise exception 'DEMO_WORKSPACE_REQUIRED';end if;
 if w.seeded_at is not null then return jsonb_build_object('already_seeded',true,'salon_id',p_salon,'anchor_date',w.anchor_date);end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 v_start=(date_trunc('month',p_anchor)-interval '13 months')::date;
 update public.salons set name='Culture House — Sample Salon',description='Private demonstration business. Every client, booking, review and financial record is fictional sample data.',
  owner_name='Demo Business Owner',operator_type='team',business_type='Hair Salon',status='Approved',application_state='Approved',approved_at=now(),
  subscription_tier='Premium',subscription_status='Active',date_joined=v_start,created_at=v_start,
  address_street='123 Sample Avenue',address_city='New York',address_state='NY',address_zip='10027',neighborhood='Harlem',
  time_zone='America/New_York',media_consent=true,onboarding_completed_at=v_start,onboarding_progress=100,
  hours='{"Sun":{"open":"09:00","close":"20:00"},"Mon":{"open":"09:00","close":"20:00"},"Tue":{"open":"09:00","close":"20:00"},"Wed":{"open":"09:00","close":"20:00"},"Thu":{"open":"09:00","close":"20:00"},"Fri":{"open":"09:00","close":"20:00"},"Sat":{"open":"09:00","close":"20:00"}}',
  cover_photo_url=v_photos->>0,gallery_photos=v_photos,phone='+12125550100'
 where id=p_salon;
 insert into public.subscriptions(id,salon_id,tier,status,billing_start,current_period_start,current_period_end)
 values(gc_private.demo_record_id(p_salon,'subscription',1),p_salon,'Premium','active',v_start,date_trunc('month',p_anchor),'2099-01-01');
 -- The same versioned deposit rule used by the real booking calculation.
 perform public.save_business_deposit_rule(p_salon,p_owner,gen_random_uuid(),
  (select id from public.business_deposit_rules where salon_id=p_salon order by created_at desc,id desc limit 1),
  '{"rate":20,"threshold_amount":null,"threshold_rate":null,"repeat_incident_count":null,"repeat_incident_rate":null,"incident_window_days":365}');
 select id into v_deposit_id from public.business_deposit_rules where salon_id=p_salon order by created_at desc,id desc limit 1;
 for i in 1..4 loop
  v_staff=gc_private.demo_record_id(p_salon,'staff',i);
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_staff,'staff'||i||'@private-demo.invalid','',now(),'{"gc_demo":true}',jsonb_build_object('role','salon_staff','name',v_names[i]),v_start,now()) on conflict(id)do nothing;
  insert into public.stylists(id,salon_id,user_id,name,slug,bio,specialties,photos,is_active,is_draft,years_experience,availability,created_at)
  values(v_staff,p_salon,v_staff,v_names[i],'sample-professional-'||i,'Fictional team member for private software demonstrations.',
   (select coalesce(jsonb_agg(name),'[]'::jsonb) from (select name from public.master_styles where is_active and archived_at is null order by name limit 3) specialties),
   jsonb_build_array(v_photos->>4),true,false,3+i,(select hours from public.salons where id=p_salon),v_start);
  insert into public.salon_team_members(id,salon_id,user_id,stylist_id,email,name,role,permissions,status,invited_by,activated_at)
  values(gc_private.demo_record_id(p_salon,'member',i),p_salon,v_staff,v_staff,'staff'||i||'@private-demo.invalid',v_names[i],case when i=1 then 'Manager' else 'Stylist' end,
  '{"overview":true,"bookings":true,"styles":true,"availability":true,"photos":true,"earnings_own":true,"finance_log":true}', 'Active',p_owner,v_start);
  insert into public.business_compensation_arrangements(id,salon_id,stylist_id,effective_from,kind,basis,percent,created_by)
  values(gc_private.demo_record_id(p_salon,'arrangement',i),p_salon,v_staff,v_start-7,'commission','after_discount',50,p_owner);
 end loop;
 for i in 1..6 loop
  select * into v_master from public.master_styles where is_active and archived_at is null and category_id is not null and service_group_id is not null and name=v_canonical[i];
  if v_master.id is null then raise exception 'DEMO_CATALOG_REQUIRED';end if;
  insert into public.styles(id,salon_id,name,category,description,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max,photos,master_style_id,category_id,service_group_id,is_draft,is_featured,sort_order,created_at)
  values(gc_private.demo_record_id(p_salon,'service',i),p_salon,v_services[i],v_master.category,'Sample service. Fictional prices for a private demonstration.',v_durations[i],v_durations[i],v_prices[i],v_prices[i],v_prices[i],jsonb_build_array(v_photos->>(4+(i%4))),case when v_services[i]=v_master.name then v_master.id else null end,v_master.category_id,v_master.service_group_id,false,i<=3,i,v_start);
 end loop;
 update public.stylists set assigned_service_ids=(select array_agg(id order by sort_order) from public.styles where salon_id=p_salon) where salon_id=p_salon;
 for i in 1..4 loop
  insert into public.salon_products(id,salon_id,name,description,price,sku,inventory_quantity,track_inventory,low_stock_threshold,product_status,is_visible,pickup_enabled,shipping_enabled,created_at)
  values(gc_private.demo_record_id(p_salon,'product',i),p_salon,v_products[i],'Fictional retail product for private demonstrations; not available for real purchase.',12+i*3,'SAMPLE-'||i,60,true,10,'Active',true,true,false,v_start);
 end loop;
 for i in 1..28 loop
  v_client=gc_private.demo_record_id(p_salon,'client',i);
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_client,'client'||i||'@private-demo.invalid','',now(),'{"gc_demo":true}',jsonb_build_object('role','customer','name','Sample Client '||i),v_start,now()) on conflict(id)do nothing;
  insert into public.customers(id,name,email,phone,created_at) values(v_client,'Sample Client '||i,'client'||i||'@private-demo.invalid','+121255501'||lpad(i::text,2,'0'),v_start)
  on conflict(id)do update set name=excluded.name,email=excluded.email,phone=excluded.phone;
  insert into public.business_client_cards(id,salon_id,subject_key,preferences,notes,cautions,source_locale,updated_by)
  values(gc_private.demo_record_id(p_salon,'card',i),p_salon,'customer:'||v_client,'Sample preference: comfortable tension and a natural finish.','Fictional demonstration client. No external communication is permitted.','','en',p_owner);
 end loop;
 insert into public.business_policy_revisions(id,salon_id,policy,source_locale,version,created_by,published_at,published_by)
 values(gc_private.demo_record_id(p_salon,'policy',1),p_salon,'{"cancellation_hours":24,"rescheduling_hours":24,"grace_minutes":15,"no_show":"contact_business","late_arrival":"contact_business","deposit_treatment":"platform_rules","balance_due":"after_service","satisfaction":"contact_business","preparation":"SAMPLE: arrive with detangled hair unless your service includes preparation.","guests":"ask_first","children":"ask_first","walk_ins":"welcome","notes":"Private demonstration policy. No real booking or charge.","refund_satisfaction":"contact_business","refund_terms":"Discuss the result with the business.","business_policy_text":null}','en',1,p_owner,now(),p_owner) on conflict(id)do nothing;
 update public.salons set business_policy_revision_id=gc_private.demo_record_id(p_salon,'policy',1) where id=p_salon;
 for m in 0..13 loop
  for j in 1..least(36+case m%3 when 0 then 8 when 1 then -8 else 0 end,case when m=13 then 2*(extract(day from p_anchor)::integer-1) else 60 end) loop
   i=m*44+j;v_day=(v_start+make_interval(months=>m))::date+((j-1)/2);
   v_at=(v_day+make_time(case when j%2=0 then 14 else 9 end,0,0)) at time zone 'America/New_York';
   v_staff=gc_private.demo_record_id(p_salon,'staff',1+((j-1)%4));
   v_style=gc_private.demo_record_id(p_salon,'service',1+((i-1)%6));
   v_client=gc_private.demo_record_id(p_salon,'client',1+((i-1)%28));
   v_price=v_prices[1+((i-1)%6)];v_hours=v_durations[1+((i-1)%6)];
   v_status=case when v_at>p_anchor::timestamp then 'Confirmed' when i%17=0 then 'No Show' when i%11=0 then 'Cancelled' else 'Completed' end;
   v_booking=gc_private.demo_record_id(p_salon,'booking',i);
   insert into public.bookings(id,salon_id,customer_id,stylist_id,style_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,deposit_status,balance_due,status,source,payment_mode,created_at,service_completed_at,client_notes,subtotal_before_promotion,original_deposit_amount,deposit_percentage,deposit_rule_snapshot)
   values(v_booking,p_salon,v_client,v_staff,v_style,'Sample Client '||(1+((i-1)%28)), 'client'||(1+((i-1)%28))||'@private-demo.invalid',v_at,v_hours,v_price,round(v_price*0.2,2),'Paid',round(v_price*0.8,2),v_status,'sample','test',v_at-interval '7 days',case when v_status='Completed' then v_at+v_hours*interval '1 hour' else null end,'SAMPLE DATA — simulated booking and payments; no provider transaction.',v_price,round(v_price*0.2,2),20,jsonb_build_object('version',v_deposit_id,'basis','eligible_service_subtotal_before_discounts','subtotal',v_price,'deposit',round(v_price*0.2,2),'rate',20));
   v_receipt=gc_private.demo_record_id(p_salon,'deposit',i);
   insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,note,created_by)
   values(v_receipt,p_salon,v_booking,v_at-interval '7 days','deposit','other',round(v_price*20)::bigint,'SAMPLE — simulated deposit, no real funds.',p_owner);
   if v_status='Completed' then
    insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,note,created_by)
    values(gc_private.demo_record_id(p_salon,'balance',i),p_salon,v_booking,v_at+v_hours*interval '1 hour','balance','other',round(v_price*80)::bigint,'SAMPLE — simulated balance payment, no real funds.',p_owner);
    if i%7=0 then
     insert into public.business_client_formulas(salon_id,card_id,booking_id,formula,source_locale,updated_by)
     values(p_salon,gc_private.demo_record_id(p_salon,'card',1+((i-1)%28)),v_booking,jsonb_build_object('technique',v_services[1+((i-1)%6)],'size','Medium','length','Shoulder length','instructions','SAMPLE: light tension, protect the edges.','duration_minutes',v_hours*60),'en',p_owner);
    end if;
    if i%9=0 then
     insert into public.reviews(id,booking_id,customer_id,salon_id,stylist_id,rating_overall,written_review,display_name,moderation_status,created_at)
     values(gc_private.demo_record_id(p_salon,'review',i),v_booking,v_client,p_salon,v_staff,4+(i%2),'Sample review: a friendly visit and a carefully finished style. Invented for this private demonstration.','Sample Client '||(1+((i-1)%28)),'Published',v_at+interval '1 day');
    end if;
   elsif v_status='Cancelled' then
    insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,original_payment_id,note,created_by)
    values(gc_private.demo_record_id(p_salon,'refund',i),p_salon,v_booking,v_at-interval '1 day','refund','other',round(v_price*20)::bigint,v_receipt,'SAMPLE — simulated return of deposit, no real funds.',p_owner);
   end if;
  end loop;
  -- An ordinary private offline sale exercises the real stock and accounting pipeline.
  for k in 1..4 loop
   v_sale=gc_private.demo_record_id(p_salon,'retail',m*4+k);
   v_at=(v_start+make_interval(months=>m)+interval '8 days 16 hours') at time zone 'America/New_York';
   insert into public.business_finance_sales(id,salon_id,occurred_at,source,kind,name,product_id,list_cents,cost_cents,quantity,created_by)
   values(v_sale,p_salon,v_at,'walk_in','product',v_products[k],gc_private.demo_record_id(p_salon,'product',k),(12+k*3)*100,600+k*100,1,p_owner);
   insert into public.business_finance_receipts(id,salon_id,sale_id,occurred_at,stage,method,amount_cents,note,created_by)
   values(gc_private.demo_record_id(p_salon,'retail-receipt',m*4+k),p_salon,v_sale,v_at,'full','other',(12+k*3)*100,'SAMPLE — simulated retail payment.',p_owner);
  end loop;
  -- A walk-in is never represented as a platform-paid appointment.
  if m<13 or extract(day from p_anchor)>2 then
  v_staff=gc_private.demo_record_id(p_salon,'staff',1+m%4);
  v_at=((v_start+make_interval(months=>m))::date+(case when m=13 then least(19,extract(day from p_anchor)::integer-2) else 19 end)+time '18:30') at time zone 'America/New_York';
  insert into public.bookings(id,salon_id,style_id,stylist_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,source,booking_origin,business_added_by,business_added_request_id,manual_service_name,business_policy_acceptance_kind,payment_mode,service_completed_at,created_at)
  values(gc_private.demo_record_id(p_salon,'walk-in',m),p_salon,gc_private.demo_record_id(p_salon,'service',5),v_staff,'Sample Walk-in '||m,v_at,1,0,0,0,'Not collected by Girlz Culture',case when v_at<p_anchor::timestamp then 'Completed' else 'Confirmed' end,'walk_in','business_added',p_owner,gc_private.demo_record_id(p_salon,'walk-in-request',m),v_services[5],'business_added_not_accepted','test',case when v_at<p_anchor::timestamp then v_at+interval '1 hour' end,v_at-interval '10 minutes');
  if v_at<p_anchor::timestamp then
   v_sale=gc_private.demo_record_id(p_salon,'walk-in-sale',m);
   insert into public.business_finance_sales(id,salon_id,occurred_at,source,kind,name,stylist_id,client_name,list_cents,compensation,created_by)
   values(v_sale,p_salon,v_at,'walk_in','service',v_services[5],v_staff,'Sample Walk-in '||m,5500,public.business_compensation_snapshot(p_salon,v_staff,v_at),p_owner);
   insert into public.business_finance_receipts(id,salon_id,sale_id,occurred_at,stage,method,amount_cents,note,created_by)
   values(gc_private.demo_record_id(p_salon,'walk-in-receipt',m),p_salon,v_sale,v_at,'full','other',5500,'SAMPLE — simulated walk-in payment.',p_owner);
  end if;
  end if;
  insert into public.business_finance_expenses(id,salon_id,occurred_at,category,amount_cents,treatment,note,created_by)
  values(gc_private.demo_record_id(p_salon,'rent',m),p_salon,v_start+make_interval(months=>m),'Rent',180000,'operating','SAMPLE — simulated monthly expense.',p_owner),
  (gc_private.demo_record_id(p_salon,'supplies',m),p_salon,v_start+make_interval(months=>m)+interval '5 days','Supplies',12500+m*100,'operating','SAMPLE — simulated consumable supplies.',p_owner);
  insert into public.billing_events(id,salon_id,salon_name,event_date,event_type,new_plan,amount_collected,payment_status,stripe_event_id,metadata)
  values(gc_private.demo_record_id(p_salon,'billing',m),p_salon,'Culture House — Sample Salon',v_start+make_interval(months=>m),'sample_subscription','Premium',199,'Simulated','gc-demo:'||p_salon||':'||m,'{"sample":true,"provider_charge":false}');
 end loop;
 -- Pay the earned sample commission through each historical month, never a provider payout.
 for m in 0..13 loop
  for k in 1..4 loop
   v_staff=gc_private.demo_record_id(p_salon,'staff',k);
   select coalesce(sum(round(b.estimated_total*100*(b.operating_compensation->>'percent')::numeric/100)),0) into v_price
    from public.bookings b where b.salon_id=p_salon and b.stylist_id=v_staff and b.status='Completed'
     and b.service_completed_at>=v_start+make_interval(months=>m) and b.service_completed_at<v_start+make_interval(months=>m+1);
   select v_price+coalesce(sum(round(agreed_cents*(compensation->>'percent')::numeric/100)),0) into v_price from public.business_finance_sales
    where salon_id=p_salon and stylist_id=v_staff and kind='service' and occurred_at>=v_start+make_interval(months=>m) and occurred_at<v_start+make_interval(months=>m+1);
   if v_price>0 then
    insert into public.business_compensation_payments(id,salon_id,stylist_id,occurred_at,kind,amount_cents,method,created_by)
    values(gc_private.demo_record_id(p_salon,'compensation',m*4+k),p_salon,v_staff,v_start+make_interval(months=>m+1)-interval '1 hour','commission',v_price,'other',p_owner);
   end if;
  end loop;
 end loop;
 -- Useful appointments on the current day and over the next two weeks.
 for j in 0..7 loop
  v_at=(p_anchor+j*2+time '10:00') at time zone 'America/New_York';
  v_staff=gc_private.demo_record_id(p_salon,'staff',1+j%4);v_style=gc_private.demo_record_id(p_salon,'service',2);
  v_booking=gc_private.demo_record_id(p_salon,'upcoming',j);v_client=gc_private.demo_record_id(p_salon,'client',j+1);
  insert into public.bookings(id,salon_id,customer_id,stylist_id,style_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,deposit_status,balance_due,status,source,payment_mode,created_at,client_notes,subtotal_before_promotion,original_deposit_amount,deposit_percentage,deposit_rule_snapshot)
  values(v_booking,p_salon,v_client,v_staff,v_style,'Sample Client '||(j+1),'client'||(j+1)||'@private-demo.invalid',v_at,2,95,19,'Paid',76,'Confirmed','sample','test',p_anchor-interval '3 days','SAMPLE — upcoming demonstration appointment.',95,19,20,jsonb_build_object('version',v_deposit_id,'basis','eligible_service_subtotal_before_discounts','subtotal',95,'deposit',19,'rate',20));
  insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,note,created_by)
  values(gc_private.demo_record_id(p_salon,'upcoming-deposit',j),p_salon,v_booking,p_anchor-interval '3 days','deposit','other',1900,'SAMPLE — simulated deposit.',p_owner);
  insert into public.booking_messages(id,booking_id,salon_id,sender_user_id,sender_role,body,original_body,created_at,source_locale)
  values(gc_private.demo_record_id(p_salon,'message',j),v_booking,p_salon,v_client,'customer','Sample conversation: I would like a natural finish, please.','Sample conversation: I would like a natural finish, please.',p_anchor-interval '2 days','en'),
   (gc_private.demo_record_id(p_salon,'reply',j),v_booking,p_salon,p_owner,'salon','Sample reply: noted. We can review the style together at your appointment.','Sample reply: noted. We can review the style together at your appointment.',p_anchor-interval '1 day','en');
 end loop;
 -- Rescheduling the original record retains its authoritative schedule revision.
 update public.bookings set appointment_datetime=appointment_datetime+interval '1 hour',client_notes='SAMPLE — moved from 10:00 to 11:00 at the client’s request.' where id=gc_private.demo_record_id(p_salon,'upcoming',1);
 for i in 1..3 loop
  insert into public.appointment_waitlist(id,salon_id,customer_id,style_id,starts_after,starts_before,locale,next_check_at)
  values(gc_private.demo_record_id(p_salon,'waitlist',i),p_salon,gc_private.demo_record_id(p_salon,'client',20+i),gc_private.demo_record_id(p_salon,'service',i),p_anchor+interval '1 day',p_anchor+interval '8 days','en','2099-01-01');
 end loop;
 for i in 1..28 loop
  insert into public.business_communication_preferences(salon_id,customer_id,email_enabled,sms_enabled,push_enabled,reminders,follow_up,marketing,locale)
  values(p_salon,gc_private.demo_record_id(p_salon,'client',i),false,false,false,true,i%2=0,false,'en');
 end loop;
 insert into public.salon_blockouts(id,salon_id,stylist_id,starts_at,ends_at,reason,created_by_user_id)
 values(gc_private.demo_record_id(p_salon,'break',1),p_salon,gc_private.demo_record_id(p_salon,'staff',1),(p_anchor+time '13:00')at time zone 'America/New_York',(p_anchor+time '13:30')at time zone 'America/New_York','SAMPLE — lunch break',p_owner),
 (gc_private.demo_record_id(p_salon,'closure',1),p_salon,null,(p_anchor+15+time '09:00')at time zone 'America/New_York',(p_anchor+15+time '20:00')at time zone 'America/New_York','SAMPLE — team training day',p_owner);
 insert into public.salon_promotions(id,salon_id,title,description,discount_label,starts_at,ends_at,promotion_type,discount_value,status,is_active,target_scope)
 values(gc_private.demo_record_id(p_salon,'promotion',1),p_salon,'Sample first-visit offer','Private demo offer; never sent to customers.','10% off',p_anchor-interval '1 day',p_anchor+interval '30 days','percentage',10,'Active',true,'salon'),
 (gc_private.demo_record_id(p_salon,'promotion',2),p_salon,'Sample retail offer','Draft promotion for a demonstration.','$5 off',p_anchor,p_anchor+interval '30 days','fixed',5,'Draft',false,'products');
 insert into public.notifications(id,user_id,salon_id,channel,title,body,delivery_status,recipient_role,category,action_url)
 values(gc_private.demo_record_id(p_salon,'notice',1),p_owner,p_salon,'in_app','Private sample workspace','Try asking the AI Assistant about saved photos, Boho braids, today’s bookings or last month’s finances.','delivered','salon','general','/salon/dashboard');
 update gc_private.demo_workspaces set seeded_at=now(),anchor_date=p_anchor where salon_id=p_salon;
 select count(*) into v_count from public.bookings where salon_id=p_salon;
 return jsonb_build_object('sample',true,'salon_id',p_salon,'months',14,'bookings',v_count,'photos',jsonb_array_length(v_photos));
end;$$;
revoke all on function public.seed_private_demo(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.seed_private_demo(uuid,uuid,date) to service_role;

-- No secret, email address or client details are returned by this service-only check.
create or replace function public.check_private_demo(p_salon uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,gc_private as $$
declare w gc_private.demo_workspaces%rowtype;checks jsonb;
begin
 select * into w from gc_private.demo_workspaces where salon_id=p_salon;
 if not found or not exists(select 1 from public.salons where id=p_salon and is_demo and user_id=w.owner_id) then raise exception 'DEMO_WORKSPACE_REQUIRED';end if;
 checks=jsonb_build_object(
  'private',exists(select 1 from public.salons where id=p_salon and not is_discoverable and not accepting_bookings and stripe_account_id is null),
  'sample_markers',not exists(select 1 from public.bookings where salon_id=p_salon and not is_demo),
  'saved_booking_terms',not exists(select 1 from public.bookings where salon_id=p_salon and booking_origin='marketplace' and
   (deposit_rule_snapshot is null or deposit_percentage<>20 or original_deposit_amount is distinct from deposit_amount or subtotal_before_promotion is distinct from estimated_total
    or (deposit_rule_snapshot->>'deposit')::numeric is distinct from deposit_amount or (deposit_rule_snapshot->>'subtotal')::numeric is distinct from estimated_total or round(estimated_total*0.2,2) is distinct from deposit_amount)),
  'team_schedules',not exists(select 1 from public.stylists where salon_id=p_salon and archived_at is null and not(availability ?& array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])),
  'no_provider_payment',not exists(select 1 from public.bookings where salon_id=p_salon and (payment_mode<>'test' or stripe_charge_id is not null or stripe_payment_id is not null)),
  'booking_scope',not exists(select 1 from public.bookings b join public.styles s on s.id=b.style_id join public.stylists t on t.id=b.stylist_id where b.salon_id=p_salon and (s.salon_id<>p_salon or t.salon_id<>p_salon)),
  'completed_booking_receipts',not exists(select 1 from public.bookings b where b.salon_id=p_salon and b.status='Completed' and b.booking_origin='marketplace'
    and round(b.estimated_total*100)<>(select coalesce(sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end),0) from public.business_finance_receipts r where r.salon_id=p_salon and r.booking_id=b.id)),
  'cancelled_deposits_returned',not exists(select 1 from public.bookings b where b.salon_id=p_salon and b.status='Cancelled'
    and 0<>(select coalesce(sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end),0) from public.business_finance_receipts r where r.salon_id=p_salon and r.booking_id=b.id)),
  'manual_sales_paid',not exists(select 1 from public.business_finance_sales s where s.salon_id=p_salon and s.agreed_cents<>(select coalesce(sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end),0) from public.business_finance_receipts r where r.salon_id=p_salon and r.sale_id=s.id)),
  'stock_reconciled',not exists(select 1 from public.salon_products p where p.salon_id=p_salon and (p.inventory_quantity<>(select m.after_quantity from public.business_stock_movements m where m.salon_id=p_salon and m.product_id=p.id order by m.revision desc limit 1)
    or p.inventory_quantity<>60-(select coalesce(sum(quantity),0) from public.business_finance_sales s where s.salon_id=p_salon and s.product_id=p.id))),
  'communication_disabled',not exists(select 1 from public.business_communication_preferences where salon_id=p_salon and (email_enabled or sms_enabled or push_enabled or marketing)),
  'no_external_notifications',not exists(select 1 from public.notifications where salon_id=p_salon and channel<>'in_app'),
  'no_provider_connections',not exists(select 1 from public.business_google_connections where salon_id=p_salon) and not exists(select 1 from public.business_instagram_connections where salon_id=p_salon),
  'commission_reconciled',not exists(
   select 1 from public.stylists t where t.salon_id=p_salon and
   (select coalesce(sum(round(b.estimated_total*100*(b.operating_compensation->>'percent')::numeric/100)),0) from public.bookings b where b.salon_id=p_salon and b.stylist_id=t.id and b.status='Completed')
    +(select coalesce(sum(round(s.agreed_cents*(s.compensation->>'percent')::numeric/100)),0) from public.business_finance_sales s where s.salon_id=p_salon and s.stylist_id=t.id and s.kind='service')
    <>(select coalesce(sum(p.amount_cents),0) from public.business_compensation_payments p where p.salon_id=p_salon and p.stylist_id=t.id and p.kind='commission')),
  'subscription_simulated',exists(select 1 from public.subscriptions where salon_id=p_salon and stripe_subscription_id is null and status='active')
 );
 return jsonb_build_object('sample',true,'checks',checks,'passed',not exists(select 1 from jsonb_each(checks)where value<>'true'::jsonb),
  'counts',jsonb_build_object('bookings',(select count(*) from public.bookings where salon_id=p_salon),'services',(select count(*) from public.styles where salon_id=p_salon),
   'products',(select count(*) from public.salon_products where salon_id=p_salon),'clients',(select count(*) from public.business_client_cards where salon_id=p_salon),
   'messages',(select count(*) from public.booking_messages where salon_id=p_salon),'reviews',(select count(*) from public.reviews where salon_id=p_salon)));
end;$$;
revoke all on function public.check_private_demo(uuid) from public,anon,authenticated;
grant execute on function public.check_private_demo(uuid) to service_role;

-- Explicit, service-only, atomic reset of a registered sample tenant. Identity,
-- password and the private tenant are retained. No production customer is selected.
create or replace function public.reset_private_demo(p_salon uuid,p_owner uuid,p_expected_seeded_at timestamptz,p_confirmation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gc_private as $$
declare w gc_private.demo_workspaces%rowtype;t text;result jsonb;
begin
 select * into w from gc_private.demo_workspaces where salon_id=p_salon and owner_id=p_owner for update;
 if not found or not exists(select 1 from public.salons where id=p_salon and user_id=p_owner and is_demo) or not gc_private.demo_actor(p_owner) then raise exception 'DEMO_WORKSPACE_REQUIRED';end if;
 if p_confirmation is distinct from 'RESET PRIVATE DEMO' or p_expected_seeded_at is null or w.seeded_at is distinct from p_expected_seeded_at then raise exception 'DEMO_RESET_CONFIRMATION_REQUIRED';end if;
 -- An unexpected real provider artifact is a hard stop, never deleted to make reset work.
 if exists(select 1 from public.bookings where salon_id=p_salon and (not is_demo or stripe_payment_id is not null or stripe_charge_id is not null))
  or exists(select 1 from public.product_orders where salon_id=p_salon and (not is_demo or stripe_payment_intent_id is not null)) then raise exception 'DEMO_RESET_EXTERNAL_RECORD';end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 if to_regclass('public.business_growth_settings') is not null then
  execute 'delete from public.business_growth_settings where salon_id=$1' using p_salon;
 end if;
 if to_regclass('public.gc_assistant_active_tasks') is not null then
  execute 'delete from public.gc_assistant_active_tasks where salon_id=$1' using p_salon;
 end if;
 delete from public.business_customer_campaign_recipients where campaign_id in(select id from public.business_customer_campaigns where salon_id=p_salon);
 delete from public.booking_audit_log where booking_id in(select id from public.bookings where salon_id=p_salon and is_demo);
 -- Ordered children first. Every operation is bound to this guarded tenant.
 foreach t in array array[
  'gc_assistant_memory','gc_assistant_requests','business_client_events','business_client_photos','business_client_formulas','business_client_visit_links','business_client_link_events','business_client_link_state','business_client_cards',
  'business_finance_receipts','business_compensation_payments','business_compensation_obligations','business_compensation_arrangements','business_stock_movements','business_finance_sales','business_finance_expenses','business_finance_operations','business_stock_operations',
  'business_customer_campaigns','business_communication_preferences','appointment_waitlist','reviews','notifications',
  'booking_refund_operations','salon_recovery_balances','booking_financial_events','salon_payout_attempts','product_order_refunds','product_orders','bookings',
  'salon_blockouts','salon_promotions','salon_products','business_supplies','salon_team_members','stylists','styles','subscription_change_requests','subscriptions','billing_events'] loop
  execute format('delete from public.%I where salon_id=$1',t) using p_salon;
 end loop;
 -- Retain published policy history and private auth accounts; idempotent seed reuses them.
 update gc_private.demo_workspaces set seeded_at=null where salon_id=p_salon;
 result=public.seed_private_demo(p_salon,p_owner,current_date);
 if (public.check_private_demo(p_salon)->>'passed')::boolean is distinct from true then raise exception 'DEMO_RESET_RECONCILIATION_FAILED';end if;
 return result||jsonb_build_object('reset',true,'reconciled',true);
end;$$;
revoke all on function public.reset_private_demo(uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.reset_private_demo(uuid,uuid,timestamptz,text) to service_role;

-- END PRIVATE DEMO PROCEDURES
commit;
