begin;
create temporary table team_assertions(label text);grant select,insert on team_assertions to service_role;
create function pg_temp.tassert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assistant team: %',label;end if;insert into team_assertions values(label);end $$;
create function pg_temp.treject(command text,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then denied:=true;else raise;end if;end;perform pg_temp.tassert(denied,expected);end $$;
create function pg_temp.team_draft(b uuid,a uuid,op text,id uuid,changes jsonb) returns jsonb language plpgsql as $$declare preview jsonb;args jsonb;begin
 args:=jsonb_build_object('operation',op,'record_id',id,'changes_json',changes::text);preview:=public.preview_gc_team_change(b,a,args);
 return public.save_gc_assistant_request(jsonb_build_object('id',gen_random_uuid(),'salon_id',b,'requested_by',a,'locale','en','tool','prepare_team_controls','arguments',args,'execution_payload',preview->'payload','before_summary',preview->'before','risk_class',4,'permission','settings','digest',repeat('e',64)),'[]');
end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();other_staff uuid:=gen_random_uuid();member uuid:=gen_random_uuid();other_member uuid:=gen_random_uuid();pro uuid:=gen_random_uuid();other_pro uuid:=gen_random_uuid();service uuid:=gen_random_uuid();book uuid:=gen_random_uuid();booking_before jsonb;before_data jsonb;d jsonb;r jsonb;v jsonb;bad jsonb;calls bigint;kind text;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)values(oa,'team-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'team-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'team-staff@example.test','',now(),'{"role":"salon_team"}'),(other_staff,'other-team@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id in(staff,other_staff);
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,time_zone)values(a,oa,'Team A','team-a','team-a@example.test','Active','active','Premium','UTC'),(b,ob,'Team B','team-b','team-b@example.test','Active','active','Premium','UTC');
 insert into public.stylists(id,salon_id,name,is_active,is_draft)values(pro,a,'Own professional',true,false),(other_pro,b,'Foreign professional',true,false);
 insert into public.salon_team_members(id,salon_id,user_id,email,name,role,status,permissions,stylist_id)values(member,a,staff,'team-staff@example.test','Own member','Stylist','Active','{"settings":true,"finance_manage":true,"bookings":true}',pro),(other_member,b,other_staff,'other-team@example.test','Other member','Staff','Active','{}',other_pro);
 insert into public.styles(id,salon_id,service_group_id,name,base_price,duration_min_hours,duration_max_hours,is_draft)select service,a,id,'Own service',100,1,1,false from public.service_groups limit 1;
 insert into public.bookings(id,salon_id,style_id,stylist_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,status,deposit_status)values(book,a,service,pro,'Invented sample',now()+interval '5 days',1,100,10,90,'Confirmed','Not paid');
 select to_jsonb(x) into booking_before from public.bookings x where id=book;
 select count(*) into calls from public.notification_delivery_log;
 perform set_config('request.jwt.claim.role','service_role',true);set local role service_role;
 perform pg_temp.treject(format('select public.read_gc_team_controls(%L,%L)',b,oa),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.treject(format('select public.read_gc_team_controls(%L,%L)',a,staff),'ASSISTANT_ACCESS_DENIED');
 r:=public.read_gc_team_controls(a,oa);perform pg_temp.tassert(jsonb_array_length(r->'members')=1 and r->'members'->0->>'name'='Own member' and r::text not like '%Foreign professional%','read contains only this business');
 perform pg_temp.treject(format('select public.assert_gc_team_target(%L,%L,%L,%L)',a,oa,'permissions',other_member),'ASSISTANT_RECORD_NOT_FOUND');
 perform pg_temp.treject(format('select public.assert_gc_team_target(%L,%L,%L,%L)',a,oa,'arrangement',other_pro),'ASSISTANT_RECORD_NOT_FOUND');
 foreach bad in array array['{}'::jsonb,'{"permissions":{}}','{"permissions":{"unknown":true}}','{"permissions":{"earnings":"true"}}','{"status":"Invited"}','{"user_id":"bad"}','{"permissions":null}'] loop
  perform pg_temp.treject(format('select public.preview_gc_team_change(%L,%L,%L)',a,oa,jsonb_build_object('operation','permissions','record_id',member,'changes_json',bad::text)),'ASSISTANT_INVALID_INPUT');
 end loop;
 before_data:=public.read_gc_team_controls(a,oa);d:=pg_temp.team_draft(a,oa,'permissions',member,'{"permissions":{"earnings":true,"settings":false}}');
 perform pg_temp.tassert(public.read_gc_team_controls(a,oa)=before_data,'prepare does not change any permissions');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('e',64));perform pg_temp.tassert(r->'verified'='true',r::text);
 r:=public.read_gc_team_controls(a,oa);perform pg_temp.tassert(r->'members'->0->'permissions'='{"settings":false,"finance_manage":true,"bookings":true,"earnings":true}','only reviewed grants change');
 before_data:=r;r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('e',64));perform pg_temp.tassert(r->'replayed'='true' and public.read_gc_team_controls(a,oa)=before_data,'permissions replay preserves same state');
 d:=pg_temp.team_draft(a,oa,'permissions',member,'{"status":"Inactive"}');
 reset role;update public.salon_team_members set permissions=permissions||'{"photos":true}' where id=member;set local role service_role;
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('e',64));perform pg_temp.tassert(r->>'code'='ASSISTANT_PREVIEW_STALE','concurrent permission change rejected');
 d:=pg_temp.team_draft(a,oa,'permissions',member,'{"status":"Inactive"}');r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('e',64));perform pg_temp.tassert(r->'verified'='true' and (public.read_gc_team_controls(a,oa)->'members'->0->>'status')='Inactive','reviewed disable changes access');
 v:=jsonb_build_object('effective_from',current_date,'kind','commission','basis','after_discount','percent',50,'amount_cents',null,'period',null);
 foreach bad in array array[v||'{"percent":null}',v||'{"percent":101}',v||'{"percent":1.123}',v||'{"basis":null}',v||'{"amount_cents":10}',v||jsonb_build_object('effective_from',current_date-1),v||'{"effective_from":"2026-02-31"}',v||'{"kind":"employee"}',v||'{"kind":"none"}',v||'{"salon_id":"bad"}'] loop
  perform pg_temp.treject(format('select public.preview_gc_team_change(%L,%L,%L)',a,oa,jsonb_build_object('operation','arrangement','record_id',pro,'changes_json',bad::text)),'ASSISTANT_INVALID_INPUT');
 end loop;
 d:=pg_temp.team_draft(a,oa,'arrangement',pro,v);perform pg_temp.tassert(jsonb_array_length(public.read_gc_team_controls(a,oa)->'arrangements')=0,'preparing compensation saves no agreement');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('e',64));perform pg_temp.tassert(r->'verified'='true',r::text);
 r:=public.read_gc_team_controls(a,oa);perform pg_temp.tassert(r->'arrangements'->0->'percent'='50' and r->'arrangements'->0->>'basis'='after_discount','authoritative commission readback');
 perform pg_temp.tassert(public.assert_gc_team_target(a,oa,'arrangement',pro)->'authorized'='true','confirmed history still authorized after existing agreement appears');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('e',64));perform pg_temp.tassert(r->'replayed'='true' and jsonb_array_length(public.read_gc_team_controls(a,oa)->'arrangements')=1,'compensation retry creates no duplicate');
 foreach kind in array array['booth','employee','none'] loop
  v:=jsonb_build_object('effective_from',current_date+case kind when 'booth' then 1 when 'employee' then 2 else 3 end,'kind',kind,'basis',null,'percent',null,'amount_cents',case when kind='none' then null else 10000 end,'period',case when kind='none' then null else 'week' end);
  d:=pg_temp.team_draft(a,oa,'arrangement',pro,v);r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('e',64));perform pg_temp.tassert(r->'verified'='true',kind||':'||r::text);
 end loop;
 d:=pg_temp.team_draft(a,oa,'permissions',member,'{"status":"Active"}');
 reset role;update public.platform_identities set status='Disabled' where user_id=oa;set local role service_role;
 perform pg_temp.treject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,oa,repeat('e',64)),'ASSISTANT_ACCESS_DENIED');
 reset role;update public.platform_identities set status='Active' where user_id=oa;update public.salons set subscription_tier='Solo' where id=a;set local role service_role;
 perform pg_temp.treject(format('select public.read_gc_team_controls(%L,%L)',a,oa),'ASSISTANT_PLAN_REQUIRED');
 perform pg_temp.treject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,oa,repeat('e',64)),'ASSISTANT_PLAN_REQUIRED');
 reset role;
 perform pg_temp.tassert((select to_jsonb(x)=booking_before from public.bookings x where id=book),'existing booked compensation and money terms unchanged');
 perform pg_temp.tassert((select count(*)=calls from public.notification_delivery_log),'no notifications');
 perform pg_temp.tassert(not exists(select 1 from public.business_compensation_payments where salon_id=a),'no payment record or provider action');
 perform pg_temp.tassert(not exists(select 1 from public.business_compensation_arrangements where salon_id=b),'other business untouched');
 perform pg_temp.tassert(not has_function_privilege('authenticated','public.preview_gc_team_change(uuid,uuid,jsonb)','EXECUTE') and not has_function_privilege('anon','public.read_gc_team_controls(uuid,uuid)','EXECUTE'),'no browser RPC scope bypass');
end $$;
select count(*) as passed_team_assertions from team_assertions;
rollback;

