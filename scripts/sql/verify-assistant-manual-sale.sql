-- Synthetic local-only real-role acceptance; every row rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.sale_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Manual-sale assertion: %',label;end if;end $$;
create function pg_temp.sale_reject(command text,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then denied:=true;else raise;end if;end;perform pg_temp.sale_assert(denied,expected);end $$;
create function pg_temp.sale_draft(b uuid,a uuid,se uuid,pr uuid,permission text default 'finance_log') returns jsonb language plpgsql as $$
declare id uuid:=gen_random_uuid();at timestamptz:=date_trunc('minute',now()-interval '1 hour');z text;service_name text;professional_name text;args jsonb;finance jsonb;payload jsonb;
begin
 select time_zone into z from public.salons where salons.id=b;select name into service_name from public.styles where styles.id=se;select name into professional_name from public.stylists where stylists.id=pr;
 args:=jsonb_build_object('service_id',se,'stylist_id',pr,'amount_cents',12000,'method','cash','source','walk_in','date',to_char(at at time zone z,'YYYY-MM-DD'),'time',to_char(at at time zone z,'HH24:MI'),'client_name',null,'payment_received',true);
 finance:=jsonb_build_object('occurred_at',to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'source','walk_in','kind','service','name',service_name,'product_id',null,'stylist_id',pr,'client_name',null,'list_cents',12000,'discount_cents',0,'cost_cents',null,'quantity',1,'method','cash');
 payload:=jsonb_build_object('service_name',service_name,'professional_name',professional_name,'amount_cents',12000,'method','cash','source','walk_in','client_name',null,'occurred_at',finance->>'occurred_at','time_zone',z,'finance_payload',finance);
 return public.save_gc_assistant_request(jsonb_build_object('id',id,'salon_id',b,'requested_by',a,'locale','en','tool','prepare_manual_service_sale','arguments',args,'execution_payload',payload,'risk_class',4,'permission',permission,'digest',repeat('a',64),'before_summary','{}'::jsonb), '[]'::jsonb);
end $$;
do $$
declare oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();manager uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();other_prof uuid:=gen_random_uuid();
 draft jsonb;reply jsonb;again jsonb;stale jsonb;required_key text;count_before bigint;sale uuid;receipt uuid;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(oa,'manual-sale-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'manual-sale-owner-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'manual-sale-staff@example.test','',now(),'{"role":"salon_team"}'),(manager,'manual-sale-manager@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id in(staff,manager);
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,time_zone) values(a,oa,'Manual Sale A','manual-sale-a','manual-sale-owner-a@example.test','Active','active','Premium','America/New_York'),(b,ob,'Manual Sale B','manual-sale-b','manual-sale-owner-b@example.test','Active','active','Premium','America/New_York');
 insert into public.subscriptions(salon_id,tier,status) values(a,'Premium','active'),(b,'Premium','active');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,is_draft)
 select f.id,f.business,g.id,f.name,1,1,130,false from(values(sa,a,'Silk Press'),(sb,b,'Foreign service'))f(id,business,name) cross join lateral(select id from public.service_groups limit 1)g;
 insert into public.stylists(id,salon_id,name,is_active) values(pa,a,'Aisha',true),(other_prof,a,'Other professional',true),(pb,b,'Foreign professional',true);
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions,stylist_id) values(a,staff,'manual-sale-staff@example.test','Staff','Stylist','Active','{"finance_log":true}',pa),(a,manager,'manual-sale-manager@example.test','Manager','Manager','Active','{"finance_manage":true}',null);
 perform set_config('request.jwt.claim.role','service_role',true);set local role service_role;
 draft:=pg_temp.sale_draft(a,oa,sa,pa);perform pg_temp.sale_assert(not exists(select 1 from public.business_finance_sales where salon_id=a),'preview writes no sale or receipt');
 perform pg_temp.sale_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',draft->>'id',a,oa,repeat('b',64)),'ASSISTANT_PREVIEW_STALE');
 perform pg_temp.sale_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',draft->>'id',b,ob,repeat('a',64)),'ASSISTANT_REQUEST_NOT_FOUND');
 reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.sale_assert(reply->>'verified'='true','owner confirmation');sale:=(reply->'result'->>'sale_id')::uuid;receipt:=(reply->'result'->>'receipt_id')::uuid;
 perform pg_temp.sale_assert((select agreed_cents=12000 and name='Silk Press' and cost_cents is null and client_name is null from public.business_finance_sales where id=sale),'exact stated amount and unknown cost; anonymous client allowed');
 perform pg_temp.sale_assert((select amount_cents=12000 and method='cash' and stage='full' from public.business_finance_receipts where id=receipt),'actual full cash receipt');
 again:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.sale_assert(again->>'replayed'='true' and again->'result'=reply->'result','retry freshly verifies same sale and receipt');
 perform pg_temp.sale_assert((select count(*)=1 from public.business_finance_sales where salon_id=a) and (select count(*)=1 from public.business_finance_receipts where salon_id=a),'no duplicate on retry');
 -- Crafted JSON null must not bypass the database receipt-consent boundary.
 for required_key in select unnest(array['payment_received','amount_cents','method','source','date','time','service_id','stylist_id']) loop
  draft:=pg_temp.sale_draft(a,oa,sa,pa);update public.gc_assistant_requests set arguments=jsonb_set(arguments,array[required_key],'null'::jsonb) where id=(draft->>'id')::uuid;
  reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.sale_assert(reply->>'verified'='false','required null rejected: '||required_key);
 end loop;
 -- A logger can only record for their assigned professional; manage-only works.
 draft:=pg_temp.sale_draft(a,staff,sa,pa);reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,staff,repeat('a',64));perform pg_temp.sale_assert(reply->>'verified'='true','assigned finance_log role');
 draft:=pg_temp.sale_draft(a,staff,sa,other_prof);perform pg_temp.sale_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',draft->>'id',a,staff,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 draft:=pg_temp.sale_draft(a,manager,sa,pa,'finance_manage');reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,manager,repeat('a',64));perform pg_temp.sale_assert(reply->>'verified'='true','finance_manage without finance_log');
 select count(*) into count_before from public.business_finance_sales where salon_id=a;
 draft:=pg_temp.sale_draft(a,oa,sb,pa);reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.sale_assert(reply->>'code'='ASSISTANT_PREVIEW_STALE','foreign service denied');
 draft:=pg_temp.sale_draft(a,oa,sa,pb);reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.sale_assert(reply->>'code'='ASSISTANT_PREVIEW_STALE','foreign professional denied');
 draft:=pg_temp.sale_draft(a,oa,sa,pa);reset role;update public.styles set name='Changed current name' where id=sa;set local role service_role;
 reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.sale_assert(reply->>'code'='ASSISTANT_PREVIEW_STALE','current source changed after preview');
 draft:=pg_temp.sale_draft(a,staff,sa,pa);reset role;update public.salon_team_members set permissions='{}' where user_id=staff;set local role service_role;
 perform pg_temp.sale_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',draft->>'id',a,staff,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 draft:=pg_temp.sale_draft(a,oa,sa,pa);update public.gc_assistant_requests set execution_payload=jsonb_set(execution_payload,'{finance_payload,list_cents}','1') where id=(draft->>'id')::uuid;
 reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.sale_assert(reply->>'code'='ASSISTANT_PREVIEW_STALE','tampered execution payload');
 perform pg_temp.sale_assert((select count(*)=count_before from public.business_finance_sales where salon_id=a),'all rejected changes remain atomic');
 perform pg_temp.sale_assert(not exists(select 1 from public.bookings where salon_id in(a,b)),'no appointment created');
 reset role;
 -- A missing durable receipt cannot produce success from the stored audit result.
 delete from public.business_finance_receipts where id=receipt;
 select to_jsonb(r) into draft from public.gc_assistant_requests r where r.result->>'sale_id'=sale::text;
 set local role service_role;reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.sale_assert(reply->>'verified'='false' and reply->>'code'='ASSISTANT_READBACK_FAILED','replay fails when persisted receipt is missing');
 reset role;
 perform pg_temp.sale_assert(not has_function_privilege('authenticated','public.confirm_gc_assistant_request(uuid,uuid,uuid,text)','execute') and not has_function_privilege('anon','public.confirm_gc_assistant_request(uuid,uuid,uuid,text)','execute'),'only service backend can confirm');
end $$;
rollback;
