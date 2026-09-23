begin;
set local lock_timeout='5s';
-- Read-only appointment analytics. Core finance/receipts/exports remain available
-- to every active plan. All aggregates are calculated after tenant/staff scope.
create function public.read_business_booking_report(p_salon uuid,p_actor uuid,p_month date) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.salons%rowtype;plan text;level text;assigned uuid;first_day date;after_day date;result jsonb;
begin
 if public.p0_actor_has_permission(p_salon,p_actor,'earnings') is not true
  or public.p0_actor_has_permission(p_salon,p_actor,'bookings') is not true
  or public.p0_business_plan_active(p_salon) is not true then raise exception 'REPORT_ACCESS_DENIED';end if;
 select * into s from public.salons where id=p_salon;
 if not found or p_month is null or p_month<>date_trunc('month',p_month)::date
  or p_month<date '2000-01-01' or p_month>date_trunc('month',now() at time zone s.time_zone)::date then raise exception 'REPORT_INVALID_MONTH';end if;
 if s.user_id<>p_actor then
  select stylist_id into assigned from public.salon_team_members where salon_id=p_salon and user_id=p_actor and status='Active';
  if not found then raise exception 'REPORT_ACCESS_DENIED';end if;
 end if;
 plan:=public.salon_effective_plan_key(p_salon);
 if plan not in ('solo','solo-pro','starter','growth','premium') or plan is null then raise exception 'REPORT_ACCESS_DENIED';end if;
 level:=case when plan='premium' then 'advanced' when plan in ('solo-pro','growth') then 'detailed' else 'basic' end;
 first_day:=case when level='advanced' then (p_month-interval '1 month')::date else p_month end;
 after_day:=(p_month+interval '1 month')::date;
 with scoped as materialized (
  select (b.appointment_datetime at time zone s.time_zone)::date as day,b.status,
   case when b.booking_origin='marketplace' then 'platform' when lower(regexp_replace(coalesce(b.source,''),'[ _-]','','g')) in ('walkin','phone','social','instagram','whatsapp')
    then case lower(regexp_replace(b.source,'[ _-]','','g')) when 'walkin' then 'walk_in' when 'phone' then 'phone' else 'social' end else 'other' end source,
   coalesce(nullif(b.manual_service_name,''),nullif(st.name,''),'Service') service,b.style_id,b.stylist_id,coalesce(sty.name,'Unassigned') professional,
   b.estimated_total
  from public.bookings b
  left join public.styles st on st.id=b.style_id and st.salon_id=p_salon
  left join public.stylists sty on sty.id=b.stylist_id and sty.salon_id=p_salon
  where b.salon_id=p_salon and b.is_demo=s.is_demo and (assigned is null or b.stylist_id=assigned)
   and (s.is_demo or coalesce(b.payment_mode,'live')<>'test')
   and not exists(select 1 from public.test_data_registry t where t.record_type='booking' and t.record_id=b.id::text)
   and b.appointment_datetime >= first_day::timestamp at time zone s.time_zone
   and b.appointment_datetime < after_day::timestamp at time zone s.time_zone
 ), periods as (select *,day>=p_month current_period from scoped),
 totals as (
  select current_period,count(*) bookings,count(*)filter(where status='Completed') completed,
   count(*)filter(where status='Cancelled') cancelled,count(*)filter(where status in('No Show','No-show')) no_shows,
   coalesce(sum(round(estimated_total*100))filter(where status='Completed'),0) completed_value_cents,
   count(*)filter(where status='Completed' and estimated_total is null) missing_prices
  from periods group by current_period
 ), sources as (
  select current_period,case when level='basic' then case when source='platform' then 'platform' else 'off_platform' end else source end name,count(*) bookings
  from periods group by current_period,2
 ), daily as (select day,count(*) bookings,count(*)filter(where status='Completed') completed from periods where current_period group by day),
 services as (select style_id,service name,count(*) bookings,count(*)filter(where status='Completed') completed from periods where current_period group by style_id,service),
 team as (select stylist_id,professional name,count(*) bookings,count(*)filter(where status='Completed') completed from periods where current_period group by stylist_id,professional)
 select jsonb_build_object('salon_id',p_salon,'plan',plan,'level',level,'scope',case when assigned is null then 'business' else 'assigned_professional' end,
  'month',p_month,'through',after_day-1,'time_zone',s.time_zone,'is_demo',s.is_demo,'as_of',now(),
  'totals',coalesce((select to_jsonb(t)-'current_period' from totals t where current_period),' {"bookings":0,"completed":0,"cancelled":0,"no_shows":0,"completed_value_cents":0,"missing_prices":0}'::jsonb),
  'sources',coalesce((select jsonb_agg(to_jsonb(x)-'current_period' order by name) from sources x where current_period),'[]'::jsonb),
  'daily',case when level<>'basic' then coalesce((select jsonb_agg(to_jsonb(d) order by day) from daily d),'[]'::jsonb) else null end,
  'services',case when level<>'basic' then coalesce((select jsonb_agg(to_jsonb(v)-'style_id' order by bookings desc,name,style_id) from services v),'[]'::jsonb) else null end,
  'team',case when level='advanced' and assigned is null then coalesce((select jsonb_agg(to_jsonb(t)-'stylist_id' order by bookings desc,name,stylist_id) from team t),'[]'::jsonb) else null end,
  'comparison',case when level='advanced' then jsonb_build_object('month',first_day,
    'totals',coalesce((select to_jsonb(t)-'current_period' from totals t where not current_period),' {"bookings":0,"completed":0,"cancelled":0,"no_shows":0,"completed_value_cents":0,"missing_prices":0}'::jsonb),
    'sources',coalesce((select jsonb_agg(to_jsonb(x)-'current_period' order by name) from sources x where not current_period),'[]'::jsonb)) else null end)
 into result;
 return result;
end $$;
revoke all on function public.read_business_booking_report(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.read_business_booking_report(uuid,uuid,date) to service_role;
comment on function public.read_business_booking_report(uuid,uuid,date) is 'Current-plan appointment analytics: month/day means scheduled date in the business time zone. Completed value is the saved agreed price, not cash receipts, provider settlement or profit. No client identity/contact projection. No organic ranking changes.';
update public.engine_settings set published_value='"20260923123443"'::jsonb,draft_value='"20260923123443"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
