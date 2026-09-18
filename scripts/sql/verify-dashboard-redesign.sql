-- Disposable clean database only. Never execute these fixtures in production.
begin;
create function pg_temp.redesign_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Dashboard assertion failed: %', label; end if; end $$;
create function pg_temp.redesign_reject(command text, expected text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin execute command;
  exception when others then if position(expected in sqlerrm)>0 then rejected:=true; else raise; end if; end;
  perform pg_temp.redesign_assert(rejected,expected);
end $$;
do $$
#variable_conflict error
declare
  actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); business uuid:=gen_random_uuid(); other_business uuid:=gen_random_uuid();
  first_url text:='https://fixture.invalid/business-a/first'; second_url text:='https://fixture.invalid/business-a/second'; foreign_url text:='https://fixture.invalid/business-b/first';
  first_details jsonb:='{"category":"services","title":"Tresses — 120 USD","caption":"Préparation 15 min. 请勿拉扯。","featured":false,"source_locale":"fr"}';
  second_details jsonb:='{"category":"team","title":"Team","caption":"","featured":true,"source_locale":"en"}';
  result jsonb; revision uuid;
begin
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
    (actor,'redesign-a@example.test','',now(),'{"role":"salon_owner"}'),(other_actor,'redesign-b@example.test','',now(),'{"role":"salon_owner"}');
  insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,gallery_photos) values
    (business,actor,'Redesign A','redesign-a','redesign-a@example.test','Active','active','Gold',jsonb_build_array(first_url,second_url)),
    (other_business,other_actor,'Redesign B','redesign-b','redesign-b@example.test','Active','active','Gold',jsonb_build_array(foreign_url));
  perform set_config('request.jwt.claim.role','service_role',true);
  result:=public.update_business_photo_details(business,actor,first_url,first_details,null);
  perform pg_temp.redesign_assert(result->first_url=first_details,'photo details preserve exact prose and amounts');
  result:=public.update_business_photo_details(business,actor,second_url,second_details,null);
  perform pg_temp.redesign_assert(result->first_url=first_details and result->second_url=second_details,'independent photo edits merge without overwriting');
  perform pg_temp.redesign_reject(format('select public.update_business_photo_details(%L,%L,%L,%L::jsonb,null)',business,actor,first_url,second_details),'PHOTO_STALE');
  perform pg_temp.redesign_reject(format('select public.update_business_photo_details(%L,%L,%L,%L::jsonb,null)',business,actor,foreign_url,first_details),'PHOTO_NOT_FOUND');
  perform pg_temp.redesign_reject(format('select public.update_business_photo_details(%L,%L,%L,%L::jsonb,null)',other_business,actor,foreign_url,first_details),'PHOTO_ACCESS_DENIED');
  perform pg_temp.redesign_reject(format('select public.update_business_photo_details(%L,%L,%L,%L::jsonb,null)',business,other_actor,first_url,first_details),'PHOTO_ACCESS_DENIED');
  perform pg_temp.redesign_reject(format('select public.update_business_photo_details(%L,%L,%L,%L::jsonb,null)',business,actor,first_url,first_details||'{"category":null}'),'PHOTO_INVALID');
  perform pg_temp.redesign_assert((select photo_metadata='{}'::jsonb from public.salons where id=other_business),'foreign metadata remains empty');
  result:=public.update_business_photo_details(business,actor,first_url,first_details||'{"title":"Revised"}',first_details);
  perform pg_temp.redesign_assert(result->first_url->>'title'='Revised' and result->second_url=second_details,'matching revision saves exactly one image');
  perform pg_temp.redesign_assert(public.update_business_assistant_avatar(business,actor,'cat')='cat','owner avatar saved');
  perform pg_temp.redesign_assert((select gc_assistant_avatar='cat' from public.salons where id=business),'avatar persists in correct business');
  perform pg_temp.redesign_assert((select gc_assistant_avatar='woman' from public.salons where id=other_business),'other business keeps independent default');
  perform pg_temp.redesign_reject(format('select public.update_business_assistant_avatar(%L,%L,%L)',other_business,actor,'dog'),'ASSISTANT_ACCESS_DENIED');
  perform pg_temp.redesign_reject(format('select public.update_business_assistant_avatar(%L,%L,%L)',business,other_actor,'dog'),'ASSISTANT_ACCESS_DENIED');
  perform pg_temp.redesign_reject(format('select public.update_business_assistant_avatar(%L,%L,%L)',business,actor,'https://foreign.invalid/photo'),'ASSISTANT_INVALID_AVATAR');
  update public.platform_identities set status='Suspended' where user_id=actor;
  perform pg_temp.redesign_reject(format('select public.update_business_assistant_avatar(%L,%L,%L)',business,actor,'dog'),'ASSISTANT_ACCESS_DENIED');
  perform pg_temp.redesign_reject(format('select public.update_business_photo_details(%L,%L,%L,%L::jsonb,null)',business,actor,first_url,first_details),'PHOTO_ACCESS_DENIED');
  update public.platform_identities set status='Active' where user_id=actor;
  update public.salons set subscription_status='canceled' where id=business;
  perform pg_temp.redesign_reject(format('select public.update_business_photo_details(%L,%L,%L,%L::jsonb,null)',business,actor,first_url,first_details),'PHOTO_PLAN_REQUIRED');
  perform pg_temp.redesign_assert(not has_function_privilege('authenticated','public.update_business_photo_details(uuid,uuid,text,jsonb,jsonb)','execute'),'no browser photo RPC bypass');
  perform pg_temp.redesign_assert(not has_function_privilege('anon','public.update_business_assistant_avatar(uuid,uuid,text)','execute') and not has_function_privilege('authenticated','public.update_business_assistant_avatar(uuid,uuid,text)','execute'),'no browser appearance RPC bypass');
  insert into public.business_policy_revisions(salon_id,policy,source_locale,created_by)
    values(business,jsonb_build_object('business_policy_text',repeat('预约',6000)),'zh-CN',actor) returning id into revision;
  perform pg_temp.redesign_assert((select length(policy->>'business_policy_text')=12000 from public.business_policy_revisions where id=revision),'multibyte primary policy fits without truncation');
end $$;
rollback;
