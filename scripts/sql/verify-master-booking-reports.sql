begin;
create temporary table report_assertions(label text);
grant insert,select on report_assertions to service_role;
create function pg_temp.report_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Report assertion: %',label;end if;insert into report_assertions values(label);end $$;
create function pg_temp.report_reject(command text,expected text) returns void language plpgsql as $$declare rejected boolean:=false;begin begin execute command;exception when others then if sqlerrm=expected then rejected:=true;else raise;end if;end;perform pg_temp.report_assert(rejected,expected);end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();j jsonb;plan text;first_day date:=date_trunc('month',now() at time zone 'America/New_York')::date;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(oa,'report-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'report-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'report-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,time_zone) values
 (a,oa,'Report A','report-fixture-a','report-a@example.test','Active','active','Premium','America/New_York'),(b,ob,'Secret business','report-fixture-b','report-b@example.test','Active','active','Premium','America/New_York');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,is_draft) select x.id,x.salon_id,g.id,x.name,1,1,100,false from(values(sa,a,'Boho / Knotless Braids'),(sb,b,'Secret service'))x(id,salon_id,name) cross join lateral(select id from public.service_groups where is_active and archived_at is null limit 1)g;
 insert into public.stylists(id,salon_id,name,is_active,is_draft)values(pa,a,'Professional A',true,false),(pb,a,'Professional B',true,false);
 insert into public.business_verification_locations(salon_id,address_street,address_city,address_state,address_zip,visit_status,visited_at,verified_by,visit_evidence) values(a,'1 Fixture Road','Fixture','NY','10001','verified',now()-interval '1 day',oa,'Disposable report fixture visit; no genuine approval.');
 perform set_config('request.jwt.claim.role','service_role',true);
 insert into public.bookings(salon_id,style_id,stylist_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,source,booking_origin,guest_name)
 values(a,sa,pa,(first_day+1)::timestamp at time zone 'America/New_York',1,100,10,90,'Paid','Completed','phone','marketplace','PRIVATE CLIENT ONE'),
 (a,sa,pb,(first_day+2)::timestamp at time zone 'America/New_York',1,125,10,115,'Paid','Completed','Walk-in','marketplace','PRIVATE CLIENT TWO'),
 (a,sa,pa,(first_day-1)::timestamp at time zone 'America/New_York',1,90,10,80,'Paid','Completed','phone','marketplace','PRIVATE PAST CLIENT'),
 (b,sb,null,(first_day+1)::timestamp at time zone 'America/New_York',1,999,10,989,'Paid','Completed','phone','marketplace','FOREIGN PRIVATE CLIENT');
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions,stylist_id) values(a,staff,'report-staff@example.test','Report professional','Stylist','Active','{"earnings":true,"bookings":true}',pa);
 -- Historical fixtures may be created after the simulated completion date;
 -- the report groups by the saved appointment date, never creation time.
 foreach plan in array array['Solo','Solo Pro','Starter','Growth','Premium'] loop
  update public.salons set subscription_tier=plan where id=a;
  set local role service_role;
  j:=public.read_business_booking_report(a,oa,first_day);
  perform pg_temp.report_assert(j->>'level'=case when plan='Premium' then 'advanced' when plan in('Solo Pro','Growth') then 'detailed' else 'basic' end,plan||' current entitlement');
  perform pg_temp.report_assert(j->'totals'->>'bookings'='2' and j->'totals'->>'completed_value_cents'='22500',plan||' exact scoped counts and saved values');
  perform pg_temp.report_assert((j->'daily'<>'null'::jsonb)=(plan in('Solo Pro','Growth','Premium')),plan||' detailed day restriction');
  perform pg_temp.report_assert((j->'services'<>'null'::jsonb)=(plan in('Solo Pro','Growth','Premium')),plan||' detailed service restriction');
  perform pg_temp.report_assert((j->'team'<>'null'::jsonb)=(plan='Premium'),plan||' team comparison restriction');
  perform pg_temp.report_assert((j->'comparison'<>'null'::jsonb)=(plan='Premium'),plan||' comparison restriction');
  perform pg_temp.report_assert(j::text !~ 'PRIVATE|Secret|report-b|guest_name|customer_id',plan||' no client or foreign data');
  reset role;
 end loop;
 perform pg_temp.report_assert(j->'comparison'->'totals'->>'bookings'='1' and j->'comparison'->'totals'->>'completed_value_cents'='9000','previous month exact evidence');
 perform pg_temp.report_reject(format('select public.read_business_booking_report(%L,%L,%L)',a,ob,first_day),'REPORT_ACCESS_DENIED');
 perform pg_temp.report_reject(format('select public.read_business_booking_report(%L,%L,%L)',b,oa,first_day),'REPORT_ACCESS_DENIED');
 perform pg_temp.report_reject(format('select public.read_business_booking_report(%L,%L,%L)',a,oa,first_day+1),'REPORT_INVALID_MONTH');
 perform pg_temp.report_reject(format('select public.read_business_booking_report(%L,%L,%L)',a,oa,first_day+interval '1 month'),'REPORT_INVALID_MONTH');
 perform pg_temp.report_reject(format('select public.read_business_booking_report(%L,%L,null)',a,oa),'REPORT_INVALID_MONTH');
 set local role service_role;
 j:=public.read_business_booking_report(a,staff,first_day);
 perform pg_temp.report_assert(j->>'scope'='assigned_professional' and j->'totals'->>'bookings'='1' and j->'team'='null'::jsonb,'assigned professional cannot read another professional');
 reset role;
 update public.salon_team_members set permissions='{}' where user_id=staff;
 perform pg_temp.report_reject(format('select public.read_business_booking_report(%L,%L,%L)',a,staff,first_day),'REPORT_ACCESS_DENIED');
 insert into public.bookings(salon_id,style_id,stylist_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,source,booking_origin,business_added_by,business_added_request_id,manual_service_name,business_policy_acceptance_kind)
 values(a,sa,pa,'PRIVATE WALKIN',(first_day+3)::timestamp at time zone 'America/New_York',1,0,0,0,'Not collected by Girlz Culture','Completed','walk_in','business_added',oa,gen_random_uuid(),'Boho / Knotless Braids','business_added_not_accepted');
 j:=public.read_business_booking_report(a,oa,first_day);
 perform pg_temp.report_assert(j->'sources' @> '[{"name":"walk_in","bookings":1}]'::jsonb,'full source separates manual walkin');
 perform pg_temp.report_assert(j->'totals'->>'completed_value_cents'='22500','ledger-only manual money never invented or double counted');
 update public.salons set subscription_tier='Starter' where id=a;
 j:=public.read_business_booking_report(a,oa,first_day);
 perform pg_temp.report_assert(j->'sources' @> '[{"name":"off_platform","bookings":1}]'::jsonb and not(j->'sources' @> '[{"name":"walk_in"}]'::jsonb),'summary source aggregates off-platform only');
 perform pg_temp.report_assert(j->>'level'='basic' and j->'comparison'='null'::jsonb,'downgrade immediately removes enhanced projection');
 update public.salons set subscription_status='expired' where id=a;
 perform pg_temp.report_reject(format('select public.read_business_booking_report(%L,%L,%L)',a,oa,first_day),'REPORT_ACCESS_DENIED');
 perform pg_temp.report_assert(not has_function_privilege('authenticated','public.read_business_booking_report(uuid,uuid,date)','execute'),'raw browser cannot choose actor or business');
 perform pg_temp.report_assert(not has_function_privilege('anon','public.read_business_booking_report(uuid,uuid,date)','execute'),'public cannot read report');
 perform pg_temp.report_assert(has_function_privilege('service_role','public.read_business_booking_report(uuid,uuid,date)','execute'),'server may execute scoped report');
end $$;
select count(*)||' booking report assertions passed' from report_assertions;
rollback;
