begin;
-- These settings only select existing reminder/offer paths. They never grant
-- consent, send on install, reserve an appointment or change a billing plan.
create table public.business_growth_settings (
 salon_id uuid primary key references public.salons(id) on delete cascade,
 revision integer not null default 0 check(revision>=0),
 reminder_hours integer[],
 waitlist_service_ids uuid[] not null default '{}',
 waitlist_professional_ids uuid[] not null default '{}',
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
 is_demo boolean not null default false
);
alter table public.business_growth_settings enable row level security;
revoke all on public.business_growth_settings from public,anon,authenticated;
grant all on public.business_growth_settings to service_role;
create trigger aaa_demo_classification before insert or update on public.business_growth_settings
for each row execute function gc_private.guard_demo_record();

create function public.business_reminder_hours(p_salon uuid) returns integer[]
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare configured jsonb; hours integer[]; plan text:=public.salon_effective_plan_key(p_salon);
begin
 select reminder_hours into hours from public.business_growth_settings where salon_id=p_salon;
 if plan in ('solo-pro','growth','premium') and hours is not null then
  return case when plan='premium' then hours else hours[1:2] end;
 end if;
 select published_value into configured from public.engine_settings where setting_key='notifications.booking_reminder_hours';
 if jsonb_typeof(configured)='array' then
  select array_agg(h order by h desc) into hours from (
   select distinct value::text::integer h from jsonb_array_elements(configured)
   where jsonb_typeof(value)='number' and value::text ~ '^[0-9]{1,3}$'
    and value::text::integer between 1 and 336 order by h desc limit 6
  ) x;
 end if;
 return coalesce(hours,array[24,2]);
end $$;
create function public.booking_reminder_hours_in_use() returns integer[]
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(array_agg(distinct h order by h desc),'{}'::integer[]) from public.salons s
 cross join lateral unnest(public.business_reminder_hours(s.id)) h
 where not s.is_demo and exists(select 1 from public.bookings b where b.salon_id=s.id and b.status='Confirmed'
  and b.booking_origin='marketplace' and b.appointment_datetime between now() and now()+interval '15 days');
$$;
create function public.read_business_growth_settings(p_salon uuid,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.business_growth_settings%rowtype; plan text;
begin
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor)
  or not public.p0_actor_has_permission(p_salon,p_actor,'settings') then raise exception 'GROWTH_ACCESS_DENIED';end if;
 plan:=public.salon_effective_plan_key(p_salon);
 select * into r from public.business_growth_settings where salon_id=p_salon;
 return jsonb_build_object('revision',coalesce(r.revision,0),'plan',plan,
  'reminder_hours',r.reminder_hours,'effective_reminder_hours',public.business_reminder_hours(p_salon),
  'reminder_limit',case when plan='premium' then 6 when plan in ('solo-pro','growth') then 2 else 0 end,
  'waitlist_mode',case when plan='premium' then 'targeted' when plan in ('solo-pro','growth') then 'automated' else 'manual' end,
  'waitlist_service_ids',coalesce(r.waitlist_service_ids,'{}'::uuid[]),'waitlist_professional_ids',coalesce(r.waitlist_professional_ids,'{}'::uuid[]),
  'services',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.styles where salon_id=p_salon and archived_at is null and not is_draft),'[]'::jsonb),
  'professionals',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.stylists where salon_id=p_salon and archived_at is null and is_active and not is_draft),'[]'::jsonb));
end $$;
create function public.save_business_growth_settings(p_salon uuid,p_actor uuid,p_revision integer,p_settings jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare current_settings jsonb; plan text; hours integer[]; services uuid[]; professionals uuid[];
begin
 perform 1 from public.salons where id=p_salon for update;
 current_settings:=public.read_business_growth_settings(p_salon,p_actor);plan:=current_settings->>'plan';
 if plan is null then raise exception 'GROWTH_PLAN_REQUIRED';end if;
 if p_revision is null or (current_settings->>'revision')::integer<>p_revision then raise exception 'GROWTH_STALE';end if;
 if jsonb_typeof(p_settings) is distinct from 'object' or p_settings- array['reminder_hours','waitlist_service_ids','waitlist_professional_ids']<>'{}'::jsonb
  or not (p_settings ?& array['reminder_hours','waitlist_service_ids','waitlist_professional_ids']) then raise exception 'GROWTH_INVALID';end if;
 if p_settings->'reminder_hours'<>'null'::jsonb then
  if jsonb_typeof(p_settings->'reminder_hours') is distinct from 'array' then raise exception 'GROWTH_INVALID';end if;
  if exists(select 1 from jsonb_array_elements(p_settings->'reminder_hours') h where jsonb_typeof(h)<>'number' or h::text !~ '^[0-9]{1,3}$') then raise exception 'GROWTH_INVALID';end if;
  select array_agg(value::text::integer order by value::text::integer desc) into hours from jsonb_array_elements(p_settings->'reminder_hours');
  if hours is null or cardinality(hours)>6 or exists(select 1 from unnest(hours) h where h<1 or h>336)
   or cardinality(hours)<>(select count(distinct h) from unnest(hours) h) then raise exception 'GROWTH_INVALID';end if;
 end if;
 if hours is not null and (plan not in ('solo-pro','growth','premium') or cardinality(hours)>case when plan='premium' then 6 else 2 end) then raise exception 'GROWTH_PLAN_REQUIRED';end if;
 if jsonb_typeof(p_settings->'waitlist_service_ids') is distinct from 'array' or jsonb_typeof(p_settings->'waitlist_professional_ids') is distinct from 'array'
  or jsonb_array_length(p_settings->'waitlist_service_ids')>100 or jsonb_array_length(p_settings->'waitlist_professional_ids')>100 then raise exception 'GROWTH_INVALID';end if;
 select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[]) into services from jsonb_array_elements_text(p_settings->'waitlist_service_ids');
 select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[]) into professionals from jsonb_array_elements_text(p_settings->'waitlist_professional_ids');
 if (cardinality(services)>0 or cardinality(professionals)>0) and plan<>'premium' then raise exception 'GROWTH_PLAN_REQUIRED';end if;
 if exists(select 1 from unnest(services) x where not exists(select 1 from public.styles where id=x and salon_id=p_salon and archived_at is null and not is_draft))
  or exists(select 1 from unnest(professionals) x where not exists(select 1 from public.stylists where id=x and salon_id=p_salon and archived_at is null and is_active and not is_draft)) then raise exception 'GROWTH_INVALID';end if;
 insert into public.business_growth_settings(salon_id,revision,reminder_hours,waitlist_service_ids,waitlist_professional_ids,updated_by)
 values(p_salon,p_revision+1,hours,services,professionals,p_actor) on conflict(salon_id) do update set revision=excluded.revision,
  reminder_hours=excluded.reminder_hours,waitlist_service_ids=excluded.waitlist_service_ids,waitlist_professional_ids=excluded.waitlist_professional_ids,updated_at=now(),updated_by=excluded.updated_by;
 return public.read_business_growth_settings(p_salon,p_actor);
end $$;

-- Recheck the current schedule before each channel claim, including a downgrade
-- or owner edit after a worker listed due bookings. Consent still runs last.
create or replace function public.claim_scheduled_notification_delivery(p_booking_id uuid,p_event_type text,p_recipient_type text,p_channel text,p_destination text,p_deduplication_key text,p_schedule_revision integer)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype; hours integer;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or b.is_demo or b.status<>'Confirmed' or b.schedule_revision is distinct from p_schedule_revision then return null;end if;
 if p_event_type !~ '^booking_reminder_[0-9]{1,3}h$' then return null;end if;
 hours:=substring(p_event_type from '^booking_reminder_([0-9]{1,3})h$')::integer;
 if not hours=any(public.business_reminder_hours(b.salon_id)) then return null;end if;
 return public.claim_notification_delivery(p_booking_id,p_event_type,p_recipient_type,p_channel,p_destination,p_deduplication_key);
end $$;
create or replace function public.due_booking_reminders(p_reminder_hours integer)
returns table(id uuid,appointment_datetime timestamptz,schedule_revision integer)
language sql stable security definer set search_path=pg_catalog,public as $$
 select b.id,b.appointment_datetime,b.schedule_revision from public.bookings b
 left join public.booking_reminder_claims c on c.booking_id=b.id and c.reminder_hours=p_reminder_hours and c.schedule_revision=b.schedule_revision
 where not b.is_demo and p_reminder_hours=any(public.business_reminder_hours(b.salon_id)) and p_reminder_hours between 1 and 336 and b.status='Confirmed' and b.booking_origin='marketplace'
 and b.appointment_datetime>=now()+make_interval(hours=>p_reminder_hours)-interval '30 minutes'
 and b.appointment_datetime<now()+make_interval(hours=>p_reminder_hours)+interval '20 minutes'
 and (c.booking_id is null or (c.completed_at is null and c.terminal_at is null and c.attempt_count<3
 and ((c.error_message is not null and coalesce(c.next_attempt_at,c.claimed_at)<=now())
 or (c.error_message is null and coalesce(c.lease_expires_at,c.claimed_at+interval '5 minutes')<=now()))))
 order by b.appointment_datetime,b.id limit 250;
$$;

create function public.business_automated_waitlist_allowed(p_salon uuid,p_service uuid,p_professional uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(not s.is_demo and public.salon_effective_plan_key(s.id) in ('solo-pro','growth','premium')
  and (public.salon_effective_plan_key(s.id)<>'premium' or (
   (coalesce(cardinality(g.waitlist_service_ids),0)=0 or p_service=any(g.waitlist_service_ids))
   and (coalesce(cardinality(g.waitlist_professional_ids),0)=0 or p_professional=any(g.waitlist_professional_ids)))),false)
 from public.salons s left join public.business_growth_settings g on g.salon_id=s.id where s.id=p_salon;
$$;
create or replace function public.due_appointment_waitlist() returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare batch jsonb;
begin
 update public.appointment_waitlist set status='expired' where status='waiting' and starts_before<=now();
 update public.appointment_waitlist_offers o set status='expired' where
  (status='offered' and expires_at<=now()) or (status='claimed' and exists(select 1 from public.booking_checkout_intents i where i.id=o.intent_id and (i.status in ('Expired','Failed','Cancelled') or (i.status='Pending' and i.expires_at<=now()))));
 select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) into batch from (
  select w.id as request_id,w.salon_id,w.style_id,w.customer_id,w.locale,b.id as source_booking_id,b.appointment_datetime as appointment_at,
   coalesce(w.stylist_id,b.stylist_id) as stylist_id,s.time_zone
  from public.appointment_waitlist w join public.bookings b on b.salon_id=w.salon_id
   join public.salons s on s.id=w.salon_id
  where public.business_automated_waitlist_allowed(w.salon_id,w.style_id,coalesce(w.stylist_id,b.stylist_id)) and w.status='waiting' and w.starts_before>now() and w.next_check_at<=now() and lower(b.status) in ('cancelled','canceled') and b.payment_mode is distinct from 'test'
   and b.appointment_datetime>now()+interval '30 minutes' and b.appointment_datetime between w.starts_after and w.starts_before
   and (w.stylist_id is null or w.stylist_id is not distinct from b.stylist_id)
   and not exists(select 1 from public.appointment_waitlist_offers o where o.request_id=w.id and o.source_booking_id=b.id)
  order by w.next_check_at,b.appointment_datetime,w.created_at limit 3
 ) x;
 update public.appointment_waitlist set next_check_at=now()+interval '5 minutes' where id in(select (value->>'request_id')::uuid from jsonb_array_elements(batch));
 return batch;
end $$;

alter function public.offer_appointment_waitlist(uuid,uuid,uuid,jsonb) rename to offer_appointment_waitlist_core;
alter function public.offer_appointment_waitlist_core(uuid,uuid,uuid,jsonb) set schema gc_private;
revoke all on function gc_private.offer_appointment_waitlist_core(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.offer_appointment_waitlist(p_request uuid,p_source uuid,p_stylist uuid,p_copy jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare w public.appointment_waitlist%rowtype;
begin
 select * into w from public.appointment_waitlist where id=p_request;
 if not found or not public.business_automated_waitlist_allowed(w.salon_id,w.style_id,p_stylist) then return null;end if;
 return gc_private.offer_appointment_waitlist_core(p_request,p_source,p_stylist,p_copy);
end $$;

-- A manual offer uses exactly the same authoritative checkout and consent path.
-- The owner explicitly reviews a scoped cancellation before sending the offer.
create function public.business_waitlist_openings(p_salon uuid,p_actor uuid,p_request uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare w public.appointment_waitlist%rowtype;
begin
 if not public.p0_actor_has_permission(p_salon,p_actor,'bookings') or not public.p0_business_plan_active(p_salon) then raise exception 'WAITLIST_ACCESS_DENIED';end if;
 select * into w from public.appointment_waitlist where id=p_request and salon_id=p_salon;
 if not found or not public.p0_actor_can_manage_professional(p_salon,p_actor,w.stylist_id) then raise exception 'WAITLIST_ACCESS_DENIED';end if;
 return coalesce((select jsonb_agg(row_to_json(x)) from (
  select w.id request_id,b.id source_booking_id,w.salon_id,w.customer_id,w.style_id,coalesce(w.stylist_id,b.stylist_id) stylist_id,
   b.appointment_datetime appointment_at,s.time_zone,w.locale,
   (select o.id from public.appointment_waitlist_offers o where o.request_id=w.id and o.source_booking_id=b.id and o.status='offered' and o.expires_at>now()) offer_id
  from public.bookings b join public.salons s on s.id=b.salon_id
  where b.salon_id=p_salon and not s.is_demo and w.status='waiting' and lower(b.status) in ('cancelled','canceled') and b.payment_mode is distinct from 'test'
   and b.appointment_datetime>now()+interval '30 minutes' and b.appointment_datetime between w.starts_after and w.starts_before
   and (w.stylist_id is null or w.stylist_id is not distinct from b.stylist_id)
   and public.p0_actor_can_manage_professional(p_salon,p_actor,coalesce(w.stylist_id,b.stylist_id))
   and not exists(select 1 from public.appointment_waitlist_offers o where o.request_id=w.id and o.source_booking_id=b.id and (o.status<>'offered' or o.expires_at<=now()))
  order by b.appointment_datetime,b.id limit 20
 ) x),'[]'::jsonb);
end $$;
create function public.offer_business_waitlist(p_salon uuid,p_actor uuid,p_request uuid,p_source uuid,p_stylist uuid,p_copy jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare candidates jsonb; offer_id uuid;
begin
 candidates:=public.business_waitlist_openings(p_salon,p_actor,p_request);
 if not public.p0_actor_can_manage_professional(p_salon,p_actor,p_stylist) then raise exception 'WAITLIST_ACCESS_DENIED';end if;
 -- Permit exact response-loss replay but never recreate or notify a closed offer.
 select o.id into offer_id from public.appointment_waitlist_offers o join public.appointment_waitlist w on w.id=o.request_id
  where o.request_id=p_request and o.source_booking_id=p_source and w.salon_id=p_salon and o.stylist_id is not distinct from p_stylist;
 if offer_id is not null then return offer_id;end if;
 if not exists(select 1 from jsonb_array_elements(candidates) c where c->>'source_booking_id'=p_source::text) then raise exception 'WAITLIST_OPENING_CHANGED';end if;
 return gc_private.offer_appointment_waitlist_core(p_request,p_source,p_stylist,p_copy);
end $$;
revoke all on function public.business_reminder_hours(uuid),public.booking_reminder_hours_in_use(),public.read_business_growth_settings(uuid,uuid),public.save_business_growth_settings(uuid,uuid,integer,jsonb),public.business_automated_waitlist_allowed(uuid,uuid,uuid),public.offer_appointment_waitlist(uuid,uuid,uuid,jsonb),public.business_waitlist_openings(uuid,uuid,uuid),public.offer_business_waitlist(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.business_reminder_hours(uuid),public.booking_reminder_hours_in_use(),public.read_business_growth_settings(uuid,uuid),public.save_business_growth_settings(uuid,uuid,integer,jsonb),public.business_automated_waitlist_allowed(uuid,uuid,uuid),public.offer_appointment_waitlist(uuid,uuid,uuid,jsonb),public.business_waitlist_openings(uuid,uuid,uuid),public.offer_business_waitlist(uuid,uuid,uuid,uuid,uuid,jsonb) to service_role;
update public.engine_settings set published_value='"20260923111939"'::jsonb,draft_value='"20260923111939"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
