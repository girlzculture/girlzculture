begin;
set local lock_timeout='5s';
-- Owner opt-in is separate from the existing customer's marketing consent.
-- No historical visit or plan change implicitly enables contact.
create table gc_private.rebooking_settings(
 salon_id uuid primary key references public.salons(id) on delete cascade,
 enabled boolean not null default false, absence_days integer not null default 42 check(absence_days between 30 and 180),
 minimum_visits integer not null default 1 check(minimum_visits between 1 and 20), service_ids uuid[] not null default '{}',
 revision integer not null default 0, approved_by uuid not null, updated_at timestamptz not null default now()
);
create table gc_private.rebooking_attempts(
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 customer_id uuid not null references auth.users(id), booking_id uuid not null references public.bookings(id),
 settings_revision integer not null, preference_id uuid not null references public.business_communication_preferences(id),
 preference_revision integer not null, delivery_log_id uuid not null references public.notification_delivery_log(id),
 status text not null default 'processing' check(status in('processing','accepted','uncertain')),
 attempted_at timestamptz not null default now(), completed_at timestamptz, support_reference uuid,
 unique(salon_id,customer_id,booking_id)
);
create index rebooking_business_attempts on gc_private.rebooking_attempts(salon_id,attempted_at desc);
create index bookings_rebooking_visit_idx on public.bookings(salon_id,customer_id,(coalesce(service_completed_at,appointment_datetime)) desc,id)
 where status='Completed' and customer_id is not null and not is_demo;
alter table gc_private.rebooking_settings enable row level security;
alter table gc_private.rebooking_attempts enable row level security;
revoke all on gc_private.rebooking_settings,gc_private.rebooking_attempts from public,anon,authenticated,service_role;

create function public.read_business_rebooking_settings(p_salon uuid,p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r gc_private.rebooking_settings%rowtype; plan text; sample boolean;
begin
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor)
  or not public.p0_actor_has_permission(p_salon,p_actor,'settings') then raise exception 'REBOOKING_ACCESS_DENIED';end if;
 plan:=public.salon_effective_plan_key(p_salon);
 select is_demo into sample from public.salons where id=p_salon;
 select * into r from gc_private.rebooking_settings where salon_id=p_salon;
 return jsonb_build_object('salon_id',p_salon,'revision',coalesce(r.revision,0),'enabled',coalesce(r.enabled,false),
  'effective_enabled',coalesce(r.enabled,false) and not sample and plan in('solo-pro','growth','premium') and public.p0_business_plan_active(p_salon)
   and (plan='premium' or r.minimum_visits=1 and cardinality(r.service_ids)=0),
  'absence_days',coalesce(r.absence_days,42),'minimum_visits',coalesce(r.minimum_visits,1),'service_ids',coalesce(r.service_ids,'{}'),
  'plan',plan,'segmented',plan='premium','automatic',plan in('solo-pro','growth','premium'),'is_demo',sample,
  'services',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id),'[]') from public.styles where salon_id=p_salon and not is_draft and archived_at is null),
  'attempts',(select coalesce(jsonb_agg(jsonb_build_object('status',status,'attempted_at',attempted_at,'support_reference',support_reference) order by attempted_at desc),'[]') from (select * from gc_private.rebooking_attempts where salon_id=p_salon order by attempted_at desc limit 20)x));
end $$;

create function public.save_business_rebooking_settings(p_salon uuid,p_actor uuid,p_revision integer,p_enabled boolean,p_days integer,p_minimum integer,p_services uuid[],p_reviewed boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare previous jsonb; plan text;
begin
 perform 1 from public.salons where id=p_salon for update;
 previous:=public.read_business_rebooking_settings(p_salon,p_actor);plan:=previous->>'plan';
 if p_revision is null or (previous->>'revision')::integer<>p_revision then raise exception 'REBOOKING_STALE';end if;
 if p_enabled is null or p_days is null or p_days not between 30 and 180 or p_minimum is null or p_minimum not between 1 and 20
  or p_services is null or cardinality(p_services)>100 or array_position(p_services,null) is not null
  or cardinality(p_services)<>(select count(distinct id) from unnest(p_services)id)
  or exists(select 1 from unnest(p_services) as selected(id) where not exists(select 1 from public.styles where salon_id=p_salon and styles.id=selected.id and not is_draft and archived_at is null)) then raise exception 'REBOOKING_INVALID';end if;
 if p_enabled and (p_reviewed is not true or (previous->>'is_demo')::boolean or public.p0_business_plan_active(p_salon) is not true
  or plan is null or plan not in('solo-pro','growth','premium')) then raise exception 'REBOOKING_PLAN_REQUIRED';end if;
 if p_enabled and plan<>'premium' and (p_minimum<>1 or cardinality(p_services)>0) then raise exception 'REBOOKING_PLAN_REQUIRED';end if;
 insert into gc_private.rebooking_settings(salon_id,enabled,absence_days,minimum_visits,service_ids,revision,approved_by)
 values(p_salon,p_enabled,p_days,p_minimum,p_services,p_revision+1,p_actor)
 on conflict(salon_id) do update set enabled=excluded.enabled,absence_days=excluded.absence_days,minimum_visits=excluded.minimum_visits,
 service_ids=excluded.service_ids,revision=excluded.revision,approved_by=excluded.approved_by,updated_at=now();
 return public.read_business_rebooking_settings(p_salon,p_actor);
end $$;

-- Called only by service-owned code. Each row uses that business's own visits,
-- current opt-in, registered customer identity, and last completed appointment.
create function gc_private.rebooking_candidates(p_salon uuid)
returns table(customer_id uuid,booking_id uuid,preference_id uuid,preference_revision integer,locale text,destination text)
language sql stable security definer set search_path=pg_catalog,public as $$
 select p.customer_id,b.id,p.id,p.revision,p.locale,u.email::text
 from gc_private.rebooking_settings r join public.salons s on s.id=r.salon_id
 join public.business_communication_preferences p on p.salon_id=s.id and p.customer_id is not null and p.guest_booking_id is null and p.marketing and p.email_enabled
 join auth.users u on u.id=p.customer_id and u.email_confirmed_at is not null and coalesce(u.email,'')<>'' and coalesce(u.raw_app_meta_data->>'gc_demo','false')<>'true'
 join public.customers c on c.id=u.id and c.status='Active'
 join public.platform_identities i on i.user_id=u.id and i.primary_role='customer' and i.status='Active'
 join lateral(select x.* from public.bookings x where x.salon_id=s.id and x.customer_id=p.customer_id and x.status='Completed'
  and not x.is_demo and coalesce(x.payment_mode,'live')<>'test'
  and not exists(select 1 from public.test_data_registry t where t.record_type='booking' and t.record_id=x.id::text)
  order by coalesce(x.service_completed_at,x.appointment_datetime) desc,x.id limit 1)b on true
 where s.id=p_salon and not s.is_demo and r.enabled and r.approved_by=s.user_id
  and public.is_salon_profile_public(s.id) and public.p0_business_plan_active(s.id)
  and public.p0_actor_has_permission(s.id,r.approved_by,'settings') and public.p0_actor_has_permission(s.id,r.approved_by,'client_history')
  and public.p0_actor_has_permission(s.id,r.approved_by,'promotions')
  and public.salon_effective_plan_key(s.id) in('solo-pro','growth','premium')
  and (public.salon_effective_plan_key(s.id)='premium' or r.minimum_visits=1 and cardinality(r.service_ids)=0)
  and p.locale in('en','fr','es','zh-CN')
  and not exists(select 1 from public.business_communication_preferences guest where guest.salon_id=s.id and guest.guest_booking_id=b.id and (not guest.marketing or not guest.email_enabled))
  and coalesce(b.service_completed_at,b.appointment_datetime) between now()-interval '365 days' and now()-make_interval(days=>r.absence_days)
  and (cardinality(r.service_ids)=0 or b.style_id=any(r.service_ids))
  and (select count(*) from public.bookings v where v.salon_id=s.id and v.customer_id=p.customer_id and v.status='Completed' and not v.is_demo
   and coalesce(v.payment_mode,'live')<>'test' and coalesce(v.service_completed_at,v.appointment_datetime) between now()-interval '365 days' and now()
   and not exists(select 1 from public.test_data_registry t where t.record_type='booking' and t.record_id=v.id::text))>=r.minimum_visits
  and not exists(select 1 from public.bookings future where future.salon_id=s.id and future.customer_id=p.customer_id
   and (future.status in('Ready','In Progress','Checked In') or future.status in('Pending','Confirmed','Arriving Soon') and future.appointment_datetime>=now()))
  and not exists(select 1 from gc_private.rebooking_attempts a where a.salon_id=s.id and a.customer_id=p.customer_id and (a.booking_id=b.id or a.attempted_at>now()-interval '30 days'))
  and (select count(*) from gc_private.rebooking_attempts a where a.salon_id=s.id and a.attempted_at>now()-interval '1 day')<20;
$$;
revoke all on function gc_private.rebooking_candidates(uuid) from public,anon,authenticated,service_role;

create function public.due_business_rebooking_reminders() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('salon_id',salon_id,'customer_id',customer_id,'booking_id',booking_id)),'[]')
 from (select r.salon_id,c.customer_id,c.booking_id from gc_private.rebooking_settings r
  cross join lateral gc_private.rebooking_candidates(r.salon_id)c
  where r.enabled and exists(select 1 from public.engine_settings where setting_key='notifications.channels' and status='Published' and published_value @> '["email"]'::jsonb)
  order by coalesce((select max(attempted_at) from gc_private.rebooking_attempts a where a.salon_id=r.salon_id),'-infinity'::timestamptz),r.salon_id,c.customer_id limit 3)x;
$$;

create function public.claim_business_rebooking_reminder(p_salon uuid,p_customer uuid,p_booking uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare candidate record; business public.salons%rowtype; attempt uuid:=gen_random_uuid();log_id uuid;rev integer;
begin
 select * into business from public.salons where id=p_salon for update;
 if not found or business.is_demo then return null;end if;
 perform 1 from public.bookings where id=p_booking and salon_id=p_salon and customer_id=p_customer for update;
 perform 1 from public.business_communication_preferences where salon_id=p_salon and customer_id=p_customer for share;
 if not exists(select 1 from public.engine_settings where setting_key='notifications.channels' and status='Published' and published_value @> '["email"]'::jsonb) then return null;end if;
 select * into candidate from gc_private.rebooking_candidates(p_salon) where customer_id=p_customer and booking_id=p_booking;
 if not found then return null;end if;
 select revision into rev from gc_private.rebooking_settings where salon_id=p_salon;
 log_id:=public.claim_notification_delivery(p_booking,'business_campaign:'||attempt,'customer','email',candidate.destination,'business-rebooking:'||p_salon||':'||p_customer||':'||p_booking);
 if log_id is null then return null;end if;
 insert into gc_private.rebooking_attempts(id,salon_id,customer_id,booking_id,settings_revision,preference_id,preference_revision,delivery_log_id)
 values(attempt,p_salon,p_customer,p_booking,rev,candidate.preference_id,candidate.preference_revision,log_id);
 return jsonb_build_object('attempt_id',attempt,'salon_id',p_salon,'preference_id',candidate.preference_id,'locale',candidate.locale,
  'destination',candidate.destination,'business_name',business.name,'booking_path','/salon/'||coalesce(nullif(business.slug,''),business.id::text)||'/book');
end $$;

create function public.finish_business_rebooking_reminder(p_salon uuid,p_attempt uuid,p_status text,p_reference uuid default null) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r gc_private.rebooking_attempts%rowtype;
begin
 if p_status is null or p_status not in('accepted','uncertain') then raise exception 'REBOOKING_INVALID';end if;
 select * into r from gc_private.rebooking_attempts where salon_id=p_salon and id=p_attempt for update;
 if not found then raise exception 'REBOOKING_ACCESS_DENIED';end if;
 if r.status=p_status then return;end if;
 if r.status<>'processing' then raise exception 'REBOOKING_STALE';end if;
 update gc_private.rebooking_attempts set status=p_status,completed_at=now(),support_reference=p_reference where id=r.id;
 update public.notification_delivery_log set delivery_status=case when p_status='accepted' then 'delivered' else 'failed' end,
  error_message=case when p_status='uncertain' then 'REBOOKING_OUTCOME_UNCERTAIN_NO_RETRY' end,lease_expires_at=null,updated_at=now() where id=r.delivery_log_id;
end $$;
revoke all on function public.read_business_rebooking_settings(uuid,uuid),public.save_business_rebooking_settings(uuid,uuid,integer,boolean,integer,integer,uuid[],boolean),public.due_business_rebooking_reminders(),public.claim_business_rebooking_reminder(uuid,uuid,uuid),public.finish_business_rebooking_reminder(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_business_rebooking_settings(uuid,uuid),public.save_business_rebooking_settings(uuid,uuid,integer,boolean,integer,integer,uuid[],boolean),public.due_business_rebooking_reminders(),public.claim_business_rebooking_reminder(uuid,uuid,uuid),public.finish_business_rebooking_reminder(uuid,uuid,text,uuid) to service_role;
-- The original read-only advice must also work for the private fictional demo.
do $$declare body text;begin
 select pg_get_functiondef('public.read_business_rebooking_evidence(uuid,uuid)'::regprocedure) into body;
 if position('and coalesce(b.payment_mode,''live'')<>''test''' in body)=0 then raise exception 'REBOOKING_UPGRADE_SOURCE_CHANGED';end if;
 body:=replace(body,'and coalesce(b.payment_mode,''live'')<>''test''','and b.is_demo=s.is_demo and (s.is_demo or coalesce(b.payment_mode,''live'')<>''test'')');
 body:=replace(body,'and not exists(select 1 from public.test_data_registry t where t.record_type=''booking'' and t.record_id=b.id::text)','and (s.is_demo or not exists(select 1 from public.test_data_registry t where t.record_type=''booking'' and t.record_id=b.id::text))');
 execute body;
end $$;
update public.engine_settings set published_value='"20260923125900"'::jsonb,draft_value='"20260923125900"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
