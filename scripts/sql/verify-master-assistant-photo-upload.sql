begin;
create temporary table upload_assertions(label text);grant insert,select on upload_assertions to service_role;
create function pg_temp.uassert(ok boolean,label text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assistant photo upload: %',label;end if;insert into upload_assertions values(label);end $$;
create function pg_temp.ureject(command text,expected text)returns void language plpgsql as $$declare rejected boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then rejected:=true;else raise;end if;end;perform pg_temp.uassert(rejected,expected);end $$;
create function pg_temp.udraft(b uuid,a uuid,url text)returns jsonb language plpgsql as $$declare args jsonb;v jsonb;begin
 args:=jsonb_build_object('operation','photo_add','record_id',null,'changes_json',jsonb_build_object('url',url)::text);v:=public.preview_gc_business_operation(b,a,args);
 return public.save_gc_assistant_request(jsonb_build_object('id',gen_random_uuid(),'salon_id',b,'requested_by',a,'locale','en','tool','prepare_photo_change','arguments',args,'execution_payload',v->'payload','before_summary',v->'before','risk_class',4,'permission','photos','digest',repeat('a',64)),'[]');
end $$;
do $$declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();asset uuid;urls text[];i integer;d jsonb;r jsonb;notifications bigint;begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)values(oa,'upload-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'upload-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'upload-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,gallery_photos)values(a,oa,'Upload A','upload-a','upload-a@example.test','Active','active','Premium','[]'),(b,ob,'Upload B','upload-b','upload-b@example.test','Active','active','Premium','[]');
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions)values(a,staff,'upload-staff@example.test','Sample staff','Staff','Active','{"photos":true}');
 for i in 1..8 loop
  asset:=gen_random_uuid();urls[i]:='https://example.test/'||asset||'.jpg';
  insert into public.media_assets(id,bucket_id,object_path,public_url,media_kind,owner_user_id,salon_id,mime_type,file_size_bytes,status)
   values(asset,'salon-photos',asset||'.jpg',urls[i],'gallery',case when i=2 then ob when i=8 then staff else oa end,case when i=2 then b else a end,'image/jpeg',1000,case when i=3 then 'Quarantined' when i=4 then 'Archived' else 'Staged' end);
  if i<>5 then insert into public.media_upload_sessions(owner_user_id,salon_id,destination_bucket,destination_folder,media_kind,status,finalized_asset_id)
   values(case when i=2 then ob when i=8 then staff else oa end,case when i=2 then b else a end,'salon-photos','salons/'||a||'/gallery','gallery','Finalized',asset);end if;
 end loop;
 select count(*) into notifications from public.notification_delivery_log;
 set local role service_role;
 for i in 2..5 loop perform pg_temp.ureject(format('select pg_temp.udraft(%L,%L,%L)',a,oa,urls[i]),'ASSISTANT_RECORD_NOT_FOUND');end loop;
 perform pg_temp.ureject(format('select pg_temp.udraft(%L,%L,%L)',a,oa,'https://external.example/never-uploaded.jpg'),'ASSISTANT_RECORD_NOT_FOUND');
 perform pg_temp.ureject(format('select pg_temp.udraft(%L,%L,%L)',a,staff,urls[1]),'ASSISTANT_RECORD_NOT_FOUND');
 perform pg_temp.ureject(format('select pg_temp.udraft(%L,%L,%L)',b,oa,urls[2]),'ASSISTANT_ACCESS_DENIED');
 d:=pg_temp.udraft(a,oa,urls[1]);
 reset role;
 perform pg_temp.uassert((select gallery_photos='[]' from public.salons where id=a),'upload is unpublished during review');
 set local role service_role;
 perform pg_temp.ureject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,oa,repeat('b',64)),'ASSISTANT_PREVIEW_STALE');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.uassert(r->'verified'='true','confirmed gallery attachment '||r::text);
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.uassert(r->'replayed'='true','response-loss replay');
 reset role;
 perform pg_temp.uassert((select gallery_photos=jsonb_build_array(urls[1]) from public.salons where id=a),'gallery exactly once');
 perform pg_temp.uassert((select status='Attached' and attached_record_id=a::text from public.media_assets where public_url=urls[1]),'canonical asset attachment');
 perform pg_temp.uassert((select count(*)=1 from public.gc_assistant_audit where request_id=(d->>'id')::uuid and event='confirmed'),'one durable audit');
 d:=pg_temp.udraft(a,oa,urls[6]);update public.salons set gallery_photos=gallery_photos||'"https://example.test/concurrent.jpg"'::jsonb where id=a;
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.uassert(r->>'code'='ASSISTANT_PREVIEW_STALE','concurrent gallery change rejected');
 perform pg_temp.uassert((select not(gallery_photos?urls[6]) from public.salons where id=a),'stale upload unattached');
 d:=pg_temp.udraft(a,oa,urls[7]);update public.gc_assistant_requests set expires_at=now()-interval '1 minute' where id=(d->>'id')::uuid;
 perform pg_temp.ureject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,oa,repeat('a',64)),'ASSISTANT_PREVIEW_EXPIRED');
 d:=pg_temp.udraft(a,staff,urls[8]);update public.salon_team_members set permissions='{}' where salon_id=a and user_id=staff;
 perform pg_temp.ureject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,staff,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 update public.salons set gallery_photos=(select jsonb_agg('https://example.test/existing-'||n||'.jpg') from generate_series(1,16)n) where id=a;
 perform pg_temp.ureject(format('select pg_temp.udraft(%L,%L,%L)',a,oa,urls[7]),'ASSISTANT_GALLERY_FULL');
 perform pg_temp.uassert((select gallery_photos='[]' from public.salons where id=b),'other gallery untouched');
 perform pg_temp.uassert((select count(*)=notifications from public.notification_delivery_log),'no notification');
 perform pg_temp.uassert(not has_function_privilege('anon','public.preview_gc_assistant_photo_upload(uuid,uuid,jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.confirm_gc_assistant_request(uuid,uuid,uuid,text)','EXECUTE'),'server only');
end $$;
select count(*) as passed_photo_upload_assertions from upload_assertions;
rollback;
