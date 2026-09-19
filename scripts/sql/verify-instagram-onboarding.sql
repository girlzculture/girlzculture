\set ON_ERROR_STOP on
begin;
set local request.jwt.claim.role='service_role';
create function pg_temp.ig_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Instagram assertion: %',label;end if;end$$;
create function pg_temp.ig_reject(statement text,expected text) returns void language plpgsql as $$begin execute statement;raise exception 'Expected rejection %',expected;exception when others then if sqlerrm<>expected then raise;end if;end$$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('18400000-0000-4000-8000-000000000001','ig-owner-a@example.invalid','{"role":"salon_owner"}'),
 ('18400000-0000-4000-8000-000000000002','ig-owner-b@example.invalid','{"role":"salon_owner"}'),
 ('18400000-0000-4000-8000-000000000003','ig-owner-c@example.invalid','{"role":"salon_owner"}');
insert into public.salons(id,name,slug,email,user_id,status,subscription_tier) values
 ('18400000-0000-4000-8000-000000000011','Original A','instagram-fixture-a','ig-owner-a@example.invalid','18400000-0000-4000-8000-000000000001','New','Free-seed'),
 ('18400000-0000-4000-8000-000000000012','Original B','instagram-fixture-b','ig-owner-b@example.invalid','18400000-0000-4000-8000-000000000002','New','Free-seed');
set local role service_role;
do $$
declare
 a uuid:='18400000-0000-4000-8000-000000000011'; b uuid:='18400000-0000-4000-8000-000000000012';
 ua uuid:='18400000-0000-4000-8000-000000000001';ub uuid:='18400000-0000-4000-8000-000000000002';uc uuid:='18400000-0000-4000-8000-000000000003';
 imp uuid:=gen_random_uuid(); asset uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); h text:=repeat('a',64); code text:=repeat('d',64);
 r jsonb; d jsonb; f jsonb; source jsonb; generation integer; path text; url text; before_revision integer; expired_id uuid; unused_asset uuid:=gen_random_uuid();
begin
 perform pg_temp.ig_assert(public.instagram_onboarding_owner(a,ua),'active owner');
 perform pg_temp.ig_reject(format('select public.manage_business_instagram(%L,%L,%L,%L)',a,ub,'flow','{}'),'INSTAGRAM_ACCESS_DENIED');
 r:=public.manage_business_instagram(a,ua,'flow',jsonb_build_object('state_hash',h));generation:=(r->>'generation')::integer;
 r:=public.consume_business_instagram_flow(h);perform pg_temp.ig_assert(r->>'owner_id'=ua::text,'flow bound owner');
 perform pg_temp.ig_assert(public.consume_business_instagram_flow(h) is null,'state consumed once');
 perform public.manage_business_instagram(a,ua,'authorize',jsonb_build_object('generation',generation,'secret','v1.synthetic','app_user_id','100001','provider_user_id','178001','username','owned_a','expires_at',now()+interval '50 minutes'));
 r:=public.manage_business_instagram(a,ua,'claim_import',jsonb_build_object('id',imp,'generation',generation));perform pg_temp.ig_assert(r->>'existing'='false','new import');
 r:=public.manage_business_instagram(a,ua,'claim_import',jsonb_build_object('id',gen_random_uuid(),'generation',generation));perform pg_temp.ig_assert(r->>'existing'='true' and r->'import'->>'id'=imp::text,'single writer per generation');
 perform public.manage_business_instagram(a,ua,'reserve_asset',jsonb_build_object('import_id',imp,'asset_id',asset,'provider_media_id','990001'));
 path:=a::text||'/instagram-onboarding/'||imp::text||'/'||asset::text||'.jpg';url:='https://isolated.example.invalid/storage/v1/object/public/salon-photos/'||path;
 perform public.manage_business_instagram(a,ua,'finish_import',jsonb_build_object('id',imp,'profile',jsonb_build_object('id','100001','user_id','178001','username','owned_a','name','Imported name'),'is_excerpt',false,'assets',jsonb_build_array(jsonb_build_object('id',asset,'provider_media_id','990001','private_path',path,'private_sha256',repeat('e',64),'mime','image/jpeg','width',100,'height',100))));
 perform pg_temp.ig_assert((select status='disconnected' and secret is null from public.business_instagram_connections where salon_id=a),'one-time token cleared after read');
 perform pg_temp.ig_assert(not public.instagram_onboarding_account_available(b,ub,'100001') and public.instagram_onboarding_account_available(a,ua,'100001'),'app account scope checked before profile read');
 r:=public.manage_business_instagram(b,ub,'flow',jsonb_build_object('state_hash',repeat('b',64)));
 perform pg_temp.ig_reject(format('select public.manage_business_instagram(%L,%L,%L,%L)',b,ub,'authorize',jsonb_build_object('generation',(r->>'generation')::integer,'secret','v1.synthetic','app_user_id','100001','provider_user_id','178001','username','owned_a','expires_at',now()+interval '50 minutes')),'INSTAGRAM_ACCOUNT_MISMATCH');
 f:=jsonb_build_object('identity',jsonb_build_object('name','Imported name','description','','phone','','address_street','','address_city','','address_state','','address_zip',''),'services','[]'::jsonb,'hours','{}'::jsonb,'photos',jsonb_build_array('instagram-asset:'||asset::text),'team','[]'::jsonb,'policies',null);
 perform pg_temp.ig_reject(format('select public.manage_business_instagram(%L,%L,%L,%L)',b,ub,'create_draft',jsonb_build_object('import_id',imp,'request_id',request_id,'locale','en','facts',f,'uncertain','[]'::jsonb)),'INSTAGRAM_IMPORT_UNAVAILABLE');
 d:=public.manage_business_instagram(a,ua,'create_draft',jsonb_build_object('import_id',imp,'request_id',request_id,'locale','en','facts',f,'uncertain','[]'::jsonb));
 r:=public.manage_business_instagram(a,ua,'create_draft',jsonb_build_object('import_id',imp,'request_id',request_id,'locale','en','facts',f,'uncertain','[]'::jsonb));perform pg_temp.ig_assert(r->>'id'=d->>'id','idempotent private draft');
 perform pg_temp.ig_assert((select name='Original A' and coalesce(jsonb_array_length(gallery_photos),0)=0 from public.salons where id=a),'no canonical mutation before confirmation');
 perform pg_temp.ig_reject(format('select public.apply_business_onboarding_draft(%L,%L,%L,1,%L,true,false)',a,ua,d->>'id',array['identity','services','hours','photos','team','policies']),'ONBOARDING_PHOTO_NOT_OWNED');
 source:=d->'source';f:=jsonb_set(f,'{identity,name}','"Owner edited name"');f:=jsonb_set(f,'{services}','[{"name":"Independent owner service","price":null,"minutes":null,"group_id":null}]');f:=jsonb_set(f,'{hours}','{"Mon":{"closed":true}}');
 d:=public.save_business_onboarding_draft(a,ua,source,f,'[]',(d->>'id')::uuid,1);
 perform public.manage_business_instagram(a,ua,'begin_prepare',jsonb_build_object('asset_id',asset,'private_sha256',repeat('e',64),'draft_id',d->>'id','revision',2));
 perform public.manage_business_instagram(a,ua,'prepare_asset',jsonb_build_object('asset_id',asset,'private_sha256',repeat('e',64),'draft_id',d->>'id','revision',2,'public_path',path,'public_url',url));
 perform pg_temp.ig_reject(format('select public.apply_business_onboarding_draft(%L,%L,%L,2,%L,true,false)',a,ua,d->>'id',array['photos']),'ONBOARDING_REVIEW_REQUIRED');
 r:=public.apply_business_onboarding_draft(a,ua,(d->>'id')::uuid,2,array['identity','services','hours','photos','team','policies'],true,false);
 perform pg_temp.ig_assert(r->>'status'='applied' and r->'result'->>'published'='false','reviewed apply remains unpublished');
 perform pg_temp.ig_assert((select gallery_photos @> jsonb_build_array(url) and not is_discoverable from public.salons where id=a),'only prepared own image attached');
 -- A previously prepared image can be deselected before a later successful apply.
 insert into public.business_instagram_import_assets(id,import_id,salon_id,owner_id,provider_media_id,private_path,private_sha256,mime,width,height,status,public_path,public_url)
 values(unused_asset,imp,a,ua,'990002',a::text||'/instagram-onboarding/'||imp::text||'/'||unused_asset::text||'.jpg',repeat('f',64),'image/jpeg',100,100,'prepared',a::text||'/instagram-onboarding/'||imp::text||'/'||unused_asset::text||'.jpg','https://isolated.example.invalid/storage/v1/object/public/salon-photos/'||a::text||'/instagram-onboarding/'||imp::text||'/'||unused_asset::text||'.jpg');
 update public.business_instagram_imports set expires_at=now()-interval '1 second' where id=imp;
 r:=public.queue_business_instagram_expiry();
 perform public.finish_business_instagram_expiry(imp,true);
 perform pg_temp.ig_assert((select status='purged' and public_url is null from public.business_instagram_import_assets where id=unused_asset) and (select status='applied' and public_url=url from public.business_instagram_import_assets where id=asset),'per-asset expiry metadata preserved accurately');
 perform pg_temp.ig_assert(exists(select 1 from jsonb_array_elements(r)x,jsonb_array_elements(x->'assets')y where x->>'id'=imp::text and y->>'id'=asset::text and y->>'preserve_public'='true'),'approved public image retained by expiry');
 perform pg_temp.ig_assert(exists(select 1 from jsonb_array_elements(r)x,jsonb_array_elements(x->'assets')y where x->>'id'=imp::text and y->>'id'=unused_asset::text and y->>'preserve_public'='false'),'unused prepared public image queued for deletion');
 update public.salons set gallery_photos=gallery_photos||'"https://owner.example.invalid/unrelated.jpg"'::jsonb where id=a;
 update public.business_instagram_import_assets set staging_until=now()+interval '1 minute' where id=asset;
 r:=public.delete_business_instagram_data('100001',code);perform pg_temp.ig_assert(r->>'busy'='true' and r->>'complete'='false','late upload keeps deletion pending');
 perform pg_temp.ig_assert((select facts->'identity'->>'name'='Owner edited name' and facts->'services'->0->>'name'='Independent owner service' and facts->'hours'->'Mon'->>'closed'='true' and jsonb_array_length(facts->'photos')=0 from public.business_onboarding_drafts where id=(d->>'id')::uuid),'deletion preserves independent owner edits');
 perform pg_temp.ig_assert((select gallery_photos='["https://owner.example.invalid/unrelated.jpg"]' and name='Owner edited name' from public.salons where id=a),'deletion retains independent canonical facts/media');
 perform pg_temp.ig_assert((select name='Original B' from public.salons where id=b),'foreign business unchanged');
 select revision into before_revision from public.business_onboarding_drafts where id=(d->>'id')::uuid;
 update public.business_instagram_import_assets set staging_until=now()-interval '1 second' where id=asset;
 r:=public.delete_business_instagram_data('100001',code);perform pg_temp.ig_assert(jsonb_array_length(r->'assets')=1,'exact purge paths returned');
 r:=public.delete_business_instagram_data('100001',code,true);perform pg_temp.ig_assert(r->>'complete'='true','confirmed storage cleanup completes');
 r:=public.delete_business_instagram_data('100001',code,true);perform pg_temp.ig_assert(r->>'complete'='true' and (select revision=before_revision from public.business_onboarding_drafts where id=(d->>'id')::uuid),'deletion replay idempotent');
 perform pg_temp.ig_assert((select status='purged' and private_path is null and public_url is null from public.business_instagram_import_assets where id=asset),'provider assets redacted');
 -- Old owner flow invalidates after a real canonical owner transfer.
 r:=public.manage_business_instagram(a,ua,'flow',jsonb_build_object('state_hash',repeat('c',64)));
 reset role;update public.salons set user_id=uc,email='ig-owner-c@example.invalid' where id=a;set local role service_role;
 perform pg_temp.ig_assert(public.consume_business_instagram_flow(repeat('c',64)) is null,'transferred owner cannot complete old flow');
 perform pg_temp.ig_reject(format('select public.manage_business_instagram(%L,%L,%L,%L)',a,ua,'authorize',jsonb_build_object('generation',(r->>'generation')::integer)),'INSTAGRAM_ACCESS_DENIED');
 -- Abandoned imports expire without waiting for provider callback.
 expired_id:=gen_random_uuid();insert into public.business_instagram_imports(id,salon_id,owner_id,generation,provider_user_id,app_user_id,username,status,created_at,expires_at) values(expired_id,b,ub,20,'178002','100002','retention_fixture','reading',now()-interval '2 hours',now()-interval '1 hour');
 r:=public.queue_business_instagram_expiry();perform pg_temp.ig_assert(exists(select 1 from jsonb_array_elements(r)x where x->>'id'=expired_id::text),'abandoned import queued');
 perform public.finish_business_instagram_expiry(expired_id,false);perform pg_temp.ig_assert((select status='purged' and profile='{}' from public.business_instagram_imports where id=expired_id),'retention completes private purge');
 perform pg_temp.ig_assert(not has_table_privilege('authenticated','public.business_instagram_import_assets','SELECT') and not has_function_privilege('authenticated','public.manage_business_instagram(uuid,uuid,text,jsonb)','EXECUTE'),'private actual-role grants');
 raise notice 'Instagram184 actual service_role: owner/foreign scope, one-time flow, retained account binding, single writer, private draft, prepared-media six-section apply, mixed owner/provider deletion, lease/replay, owner transfer and retention PASS';
end $$;
rollback;
