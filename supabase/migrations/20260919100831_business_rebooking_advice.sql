begin;
set local lock_timeout='5s';
-- A narrow read projection reuses the existing private, owner-approved visit
-- associations. No new client identity, matching rule or contact consent.
-- SECURITY DEFINER is required solely to call the private linked-subjects
-- helper; table grants remain revoked. Both current grants and business/staff
-- scope are established before any appointment or association is projected.
create function public.read_business_rebooking_evidence(p_salon uuid,p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.salons%rowtype; assigned uuid; own boolean; checked timestamptz:=now(); today date; from_day date; rows jsonb; total integer;
begin
 if public.p0_actor_has_permission(p_salon,p_actor,'bookings') is not true
  or public.p0_actor_has_permission(p_salon,p_actor,'client_history') is not true
  or public.p0_business_plan_active(p_salon) is not true then raise exception 'REBOOKING_ACCESS_DENIED';end if;
 select * into s from public.salons where id=p_salon;
 if not found then raise exception 'REBOOKING_ACCESS_DENIED';end if;
 own:=s.user_id=p_actor;
 if not own then
  select stylist_id into assigned from public.salon_team_members where salon_id=p_salon and user_id=p_actor and status='Active';
  if not found then raise exception 'REBOOKING_ACCESS_DENIED';end if;
 end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=s.time_zone) then raise exception 'REBOOKING_INCOMPLETE';end if;
 today:=(checked at time zone s.time_zone)::date;from_day:=today-365;
 with scoped as materialized (
  select b.id,b.salon_id,b.stylist_id,b.customer_id,left(b.guest_name,200) client_name,b.appointment_datetime,b.service_completed_at,b.status,
   case when b.customer_id is null then 'booking:'||b.id else 'customer:'||b.customer_id end subject
  from public.bookings b where b.salon_id=p_salon and (assigned is null or b.stylist_id=assigned)
   and coalesce(b.payment_mode,'live')<>'test'
   and not exists(select 1 from public.test_data_registry t where t.record_type='booking' and t.record_id=b.id::text)
   and ((b.status='Completed' and coalesce(b.service_completed_at,b.appointment_datetime) >= (from_day::timestamp at time zone s.time_zone))
    or b.status in('Ready','In Progress','Checked In')
    or b.status in('Pending','Confirmed','Arriving Soon') and b.appointment_datetime>=checked)
  order by b.id limit 5001
 ), subject_groups as materialized (
  select subject,public.business_client_linked_subjects(p_salon,subject) subjects from (select distinct subject from scoped)x
 ), projected as (
  select b.id,b.salon_id,b.stylist_id,md5(p_salon::text||':'||array_to_string(g.subjects,',')) group_key,b.client_name,b.appointment_datetime,b.service_completed_at,b.status,
   b.customer_id is null and cardinality(g.subjects)=1 unlinked_guest
  from scoped b join subject_groups g on g.subject=b.subject
 )
 select (select count(*) from scoped),case when (select count(*) from scoped)>5000 then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(projected) order by id),'[]') from projected) end into total,rows;
 return jsonb_build_object('salon_id',p_salon,'as_of',checked,'time_zone',s.time_zone,'scope',case when assigned is null then 'business' else 'assigned_professional' end,
  'stylist_id',assigned,'from',from_day,'through',today,'complete',total<=5000,'record_count',total,'records',rows);
end $$;
revoke all on function public.read_business_rebooking_evidence(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_business_rebooking_evidence(uuid,uuid) to service_role;
comment on function public.read_business_rebooking_evidence(uuid,uuid) is 'Private same-business completed-visit and current-booking evidence for a labeled returning-client suggestion. Uses saved explicit visit links; never name/email matching, contact consent or another business history.';
update public.engine_settings set published_value='"20260919100831"'::jsonb,draft_value='"20260919100831"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
