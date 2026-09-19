-- Local disposable fixtures only; no provider or delivery actions.
\set ON_ERROR_STOP on
begin;
create function pg_temp.rebooking_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Rebooking assertion: %',label;end if;end $$;
create function pg_temp.rebooking_reject(command text) returns void language plpgsql as $$
declare rejected boolean:=false;begin begin execute command;exception when others then if position('REBOOKING_ACCESS_DENIED' in sqlerrm)>0 then rejected:=true;else raise;end if;end;perform pg_temp.rebooking_assert(rejected,'permission rejected');end $$;
do $$
declare oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();ca uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();p uuid:=gen_random_uuid();q uuid:=gen_random_uuid();r uuid:=gen_random_uuid();
 ba uuid:=gen_random_uuid();bb uuid:=gen_random_uuid();bc uuid:=gen_random_uuid();bg uuid:=gen_random_uuid();bf uuid:=gen_random_uuid();bu uuid:=gen_random_uuid();bt uuid:=gen_random_uuid();out jsonb;rows jsonb;key1 text;key2 text;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 (oa,'rebooking-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'rebooking-owner-b@example.test','',now(),'{"role":"salon_owner"}'),
 (ca,'rebooking-customer@example.test','',now(),'{"role":"customer"}'),(staff,'rebooking-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.customers(id,name,email) values(ca,'Shared identity','rebooking-customer@example.test');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,time_zone) values
 (a,oa,'Rebooking A','rebooking-a','rebooking-owner-a@example.test','Active','active','Premium','America/New_York'),(b,ob,'Rebooking B','rebooking-b','rebooking-owner-b@example.test','Active','active','Premium','America/New_York');
 insert into public.stylists(id,salon_id,name) values(p,a,'Assigned professional'),(q,a,'Other professional'),(r,a,'Bounded fixture professional');
 insert into public.salon_team_members(salon_id,user_id,stylist_id,email,name,role,status,permissions) values(a,staff,p,'rebooking-staff@example.test','Staff','Stylist','Active','{"bookings":true,"client_history":true}');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price)
 select x.sid,x.salon,g.id,'Fixture service',1,1,100 from(values(sa,a),(sb,b))x(sid,salon) cross join lateral(select id from public.service_groups limit 1)g;
 insert into public.bookings(id,salon_id,style_id,stylist_id,customer_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status) values
 (ba,a,sa,p,ca,'Shared identity','rebooking-customer@example.test',now()-interval '100 days',1,100,10,90,'Paid','Completed'),
 (bb,a,sa,p,ca,'Shared identity','rebooking-customer@example.test',now()-interval '70 days',1,100,10,90,'Paid','Completed'),
 (bc,a,sa,q,ca,'Shared identity','rebooking-customer@example.test',now()-interval '43 days',1,100,10,90,'Paid','Completed'),
 (bg,a,sa,p,null,'Shared identity','rebooking-customer@example.test',now()-interval '5 days',1,100,10,90,'Paid','Completed'),
 (bu,a,sa,p,null,'Unlinked guest','rebooking-customer@example.test',now()-interval '60 days',1,100,10,90,'Paid','Completed'),
 (bf,b,sb,null,ca,'Foreign business visit','rebooking-customer@example.test',now()-interval '1 day',1,100,10,90,'Paid','Completed'),
 (bt,a,sa,p,null,'Test visit','rebooking-test@example.test',now()-interval '1 day',1,100,10,90,'Paid','Completed');
 update public.bookings set payment_mode='test' where id=bt;
 update public.bookings set service_completed_at=now()-interval '40 days' where id=bc;
 perform set_config('request.jwt.claim.role','service_role',true);set local role service_role;
 out:=public.read_business_rebooking_evidence(a,oa);rows:=out->'records';
 perform pg_temp.rebooking_assert(out->>'complete'='true' and jsonb_array_length(rows)=5,'own complete live evidence');
 perform pg_temp.rebooking_assert((select (x->>'service_completed_at')::timestamptz=now()-interval '40 days' from jsonb_array_elements(rows)x where x->>'id'=bc::text),'recorded completion timestamp preserved independently of appointment date');
 perform pg_temp.rebooking_assert(out::text not like '%Foreign business visit%' and out::text not like '%@example.test%' and out::text not like '%Test visit%' and out::text not like '%customer_id%','foreign visits, contacts, test payments and account IDs excluded');
 select x->>'group_key' into key1 from jsonb_array_elements(rows)x where x->>'id'=ba::text;
 select x->>'group_key' into key2 from jsonb_array_elements(rows)x where x->>'id'=bg::text;
 perform pg_temp.rebooking_assert(key1<>key2,'same typed name/email is not identity');
 perform public.change_business_client_link(a,oa,ba,gen_random_uuid(),0,'link',bg);
 out:=public.read_business_rebooking_evidence(a,oa);rows:=out->'records';
 select x->>'group_key' into key1 from jsonb_array_elements(rows)x where x->>'id'=ba::text;
 select x->>'group_key' into key2 from jsonb_array_elements(rows)x where x->>'id'=bg::text;
 perform pg_temp.rebooking_assert(key1=key2 and not (select (x->>'unlinked_guest')::boolean from jsonb_array_elements(rows)x where x->>'id'=bg::text),'explicit canonical link joins recent guest visit');
 out:=public.read_business_rebooking_evidence(a,staff);
 perform pg_temp.rebooking_assert(out->>'scope'='assigned_professional' and out->>'stylist_id'=p::text and jsonb_array_length(out->'records')=4,'assigned professional only');
 perform pg_temp.rebooking_assert(not exists(select 1 from jsonb_array_elements(out->'records')x where x->>'stylist_id' is distinct from p::text),'no other colleague appointment projection');
 perform pg_temp.rebooking_reject(format('select public.read_business_rebooking_evidence(%L,%L)',a,ob));
 perform pg_temp.rebooking_reject(format('select public.read_business_rebooking_evidence(%L,%L)',b,oa));
 reset role;update public.salon_team_members set permissions='{"bookings":true}' where salon_id=a and user_id=staff;set local role service_role;
 perform pg_temp.rebooking_reject(format('select public.read_business_rebooking_evidence(%L,%L)',a,staff));
 reset role;update public.salon_team_members set permissions='{"client_history":true}' where salon_id=a and user_id=staff;set local role service_role;
 perform pg_temp.rebooking_reject(format('select public.read_business_rebooking_evidence(%L,%L)',a,staff));
 reset role;
 perform pg_temp.rebooking_assert(not has_function_privilege('anon','public.read_business_rebooking_evidence(uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.read_business_rebooking_evidence(uuid,uuid)','EXECUTE'),'direct browser roles cannot request arbitrary scope');
 perform pg_temp.rebooking_assert(not has_table_privilege('service_role','public.business_client_visit_links','SELECT'),'private link tables remain private');
 insert into public.bookings(id,salon_id,style_id,stylist_id,customer_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status)
 select gen_random_uuid(),a,sa,r,null,'Bounded fixture',now()-interval '1 day'-(n*interval '90 minutes'),1,100,10,90,'Paid','Completed' from generate_series(1,5001)n;
 set local role service_role;out:=public.read_business_rebooking_evidence(a,oa);reset role;
 perform pg_temp.rebooking_assert(out->>'complete'='false' and out->>'record_count'='5001' and out->'records'='[]'::jsonb,'cap returns unavailable evidence without partial client identities');
 raise notice 'Rebooking182: same-business explicit identity, staff grants and source projection PASS';
end $$;
rollback;
