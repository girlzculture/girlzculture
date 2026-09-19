-- Synthetic local fixtures only; all state is rolled back.
begin;
create function pg_temp.google_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Google assertion: %',label;end if;end $$;
create function pg_temp.google_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then rejected:=true;else raise;end if;end;perform pg_temp.google_assert(rejected,expected);end $$;
do $$
declare oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();flow jsonb;result jsonb;generation integer;operation uuid:=gen_random_uuid();second_id uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 (oa,'google-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'google-owner-b@example.test','',now(),'{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email,status) values
 (a,oa,'Google fixture A','google-fixture-a','google-owner-a@example.test','Active'),(b,ob,'Google fixture B','google-fixture-b','google-owner-b@example.test','Active');
 perform pg_temp.google_assert(public.google_business_owner(a,oa),'fresh current owner');
 perform pg_temp.google_reject(format('select public.manage_business_google(%L,%L,%L)',a,ob,'disconnect'),'GOOGLE_ACCESS_DENIED');
 perform public.manage_business_google(a,oa,'flow',jsonb_build_object('state_hash',repeat('a',64),'verifier_secret','v1.fixture'));
 flow:=public.consume_business_google_flow(repeat('a',64));
 perform pg_temp.google_assert(flow->>'salon_id'=a::text and flow->>'owner_id'=oa::text,'flow binds exact business and owner');
 perform pg_temp.google_assert(public.consume_business_google_flow(repeat('a',64)) is null,'flow cannot replay');
 perform public.manage_business_google(a,oa,'disconnect');
 perform pg_temp.google_reject(format('select public.manage_business_google(%L,%L,%L,%L)',a,oa,'authorize',jsonb_build_object('generation',flow->'generation','secret','v1.fixture')),'GOOGLE_CONNECTION_CHANGED');
 perform public.manage_business_google(a,oa,'flow',jsonb_build_object('state_hash',repeat('b',64),'verifier_secret','v1.fixture'));
 update public.business_google_oauth_flows set expires_at=now()-interval '1 second' where salon_id=a;
 perform pg_temp.google_assert(public.consume_business_google_flow(repeat('b',64)) is null,'expired flow rejected');
 perform public.manage_business_google(a,oa,'flow',jsonb_build_object('state_hash',repeat('c',64),'verifier_secret','v1.fixture'));
 flow:=public.consume_business_google_flow(repeat('c',64));
 perform public.manage_business_google(a,oa,'authorize',jsonb_build_object('generation',flow->'generation','secret','v1.fixture'));
 select c.generation into generation from public.business_google_connections c where salon_id=a;
 perform public.manage_business_google(a,oa,'connect',jsonb_build_object('generation',generation,'account','accounts/1','location','locations/1','remote_hash','remote','local_hash','local'));
 perform public.manage_business_google(a,oa,'tokens',jsonb_build_object('generation',generation,'prior_secret','v1.fixture','secret','v1.refreshed'));
 perform pg_temp.google_reject(format('select public.manage_business_google(%L,%L,%L,%L)',a,oa,'tokens',jsonb_build_object('generation',generation,'prior_secret','v1.fixture','secret','v1.stale')),'GOOGLE_CONNECTION_CHANGED');
 result:=public.manage_business_google(a,oa,'claim',jsonb_build_object('id',operation,'generation',generation,'kind','post','payload_hash','hash'));
 perform pg_temp.google_assert(result->>'existing'='false','first claim');
 perform pg_temp.google_assert(public.manage_business_google(a,oa,'claim',jsonb_build_object('id',operation,'generation',generation,'kind','post','payload_hash','hash'))->>'existing'='true','same intent idempotent');
 perform pg_temp.google_reject(format('select public.manage_business_google(%L,%L,%L,%L)',a,oa,'claim',jsonb_build_object('id',operation,'generation',generation,'kind','post','payload_hash','other')),'GOOGLE_REQUEST_CONFLICT');
 perform pg_temp.google_reject(format('select public.manage_business_google(%L,%L,%L,%L)',a,oa,'claim',jsonb_build_object('id',second_id,'generation',generation,'kind','post','payload_hash','other')),'GOOGLE_SYNC_BUSY');
 update public.business_google_connections set lease_until=now()-interval '1 second' where salon_id=a;
 perform pg_temp.google_assert(public.manage_business_google(a,oa,'claim',jsonb_build_object('id',second_id,'generation',generation,'kind','post','payload_hash','hash'))->>'status'='uncertain','lost provider response never automatically repeats post');
 perform public.manage_business_google(a,oa,'auto_sync','{"enabled":true}');
 perform pg_temp.google_assert((select count(*)=1 from public.due_business_google()),'one scheduled business');
 perform pg_temp.google_assert((select count(*)=0 from public.due_business_google()),'overlapping job cannot reserve same business');
 perform public.manage_business_google(a,oa,'check_failed',jsonb_build_object('generation',generation,'error_code','GOOGLE_REMOTE_CONFLICT'));
 perform pg_temp.google_assert((select not auto_sync and last_error='GOOGLE_REMOTE_CONFLICT' from public.business_google_connections where salon_id=a),'external conflict stops automatic synchronization');
 perform pg_temp.google_reject(format('select public.manage_business_google(%L,%L,%L,%L)',a,oa,'auto_sync','{"enabled":true}'),'GOOGLE_REVIEW_REQUIRED');
 perform public.manage_business_google(a,oa,'disconnect');
 perform pg_temp.google_assert((select secret is null and not auto_sync and status='disconnected' from public.business_google_connections where salon_id=a),'disconnect deletes secret and stops jobs');
 perform pg_temp.google_reject(format('select public.manage_business_google(%L,%L,%L,%L)',a,oa,'finish',jsonb_build_object('generation',generation,'id',operation,'status','completed')),'GOOGLE_CONNECTION_CHANGED');
 update public.platform_identities set status='Disabled' where user_id=oa;
 perform pg_temp.google_reject(format('select public.manage_business_google(%L,%L,%L)',a,oa,'disconnect'),'GOOGLE_ACCESS_DENIED');
 perform pg_temp.google_assert(not has_table_privilege('authenticated','public.business_google_connections','SELECT') and not has_table_privilege('anon','public.business_google_oauth_flows','SELECT'),'browser roles cannot read tokens or OAuth state');
 perform pg_temp.google_assert(not has_function_privilege('authenticated','public.manage_business_google(uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.consume_business_google_flow(text)','EXECUTE'),'privileged routines cannot be invoked from browser');
 perform pg_temp.google_assert((select count(*)=0 from public.business_google_sync_operations where salon_id=b),'other business untouched');
end $$;
rollback;
