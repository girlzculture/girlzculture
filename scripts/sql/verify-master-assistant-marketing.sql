\set ON_ERROR_STOP on
begin;
create temporary table marketing_assertions(label text);grant insert,select on marketing_assertions to service_role;
create function pg_temp.massert(ok boolean,label text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assistant marketing: %',label;end if;insert into marketing_assertions values(label);end $$;
create function pg_temp.mreject(command text,expected text)returns void language plpgsql as $$declare rejected boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then rejected:=true;else raise;end if;end;perform pg_temp.massert(rejected,expected);end $$;
create function pg_temp.mdraft(b uuid,a uuid,operation text,target uuid,changes jsonb)returns jsonb language plpgsql as $$declare args jsonb;v jsonb;begin
 args:=jsonb_build_object('operation',operation,'record_id',target,'changes_json',changes::text);v:=public.preview_gc_business_operation(b,a,args);
 return public.save_gc_assistant_request(jsonb_build_object('id',gen_random_uuid(),'salon_id',b,'requested_by',a,'locale','fr','tool','prepare_marketing_change','arguments',args,'execution_payload',v->'payload','before_summary',v->'before','risk_class',4,'permission','promotions','digest',repeat('a',64)),'[]');
end $$;
do $$declare oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();booking_a uuid:=gen_random_uuid();booking_b uuid:=gen_random_uuid();src jsonb;copies jsonb;c jsonb;d jsonb;r jsonb;post_id uuid;foreign_id uuid;notifications bigint;begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 (oa,'marketing-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'marketing-owner-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'marketing-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.salons(id,user_id,name,slug,email,status,is_discoverable,accepting_bookings,subscription_status,subscription_tier,gallery_photos,photo_metadata) values
 (a,oa,'Marketing A','marketing-fixture-a','marketing-owner-a@example.test','Active',true,true,'active','Premium','["https://fixture.invalid/own.jpg"]','{"https://fixture.invalid/own.jpg":{"category":"before_after","title":"Owner supplied title"}}'),
 (b,ob,'Marketing B','marketing-fixture-b','marketing-owner-b@example.test','Active',true,true,'active','Premium','["https://fixture.invalid/foreign.jpg"]','{}');
 insert into public.subscriptions(salon_id,tier,status) values(a,'Premium','active'),(b,'Premium','active');
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions) values(a,staff,'marketing-staff@example.test','Marketing staff','Manager','Active','{"promotions":true}');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max,is_draft)
 select f.id,f.business,g.id,f.name,1,1,100,100,150,false from(values(sa,a,'Boho / Goddess Braids'),(sb,b,'Foreign service'))f(id,business,name) cross join lateral(select id from public.service_groups limit 1)g;
 insert into public.salon_promotions(id,salon_id,title,public_headline,promotion_type,discount_value,target_scope,target_ids,status,is_active,starts_at,ends_at)
 values(pa,a,'Own offer','Own offer','percentage',20,'services',array[sa::text],'Active',true,now()-interval '1 day',now()+interval '2 days'),(pb,b,'Foreign offer','Foreign offer','percentage',20,'services',array[sb::text],'Active',true,now()-interval '1 day',now()+interval '2 days');
 insert into public.bookings(id,salon_id,style_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status)
 values(booking_a,a,sa,'Private client A','private-a@example.test',now()-interval '1 day',1,100,10,90,'Paid','Completed'),(booking_b,b,sb,'Private client B','private-b@example.test',now()-interval '1 day',1,100,10,90,'Paid','Completed');
 insert into public.salon_applications(salon_id,user_id,business_name,owner_name,business_email,phone,street_address,city,state,zip_code,business_type,status,selected_plan,business_setup_type)
 values(a,oa,'Marketing A','Owner A','marketing-owner-a@example.test','+13055550123','123 Fixture Street','Miami','FL','33101','Hair Salon','Approved','Premium','solo_professional');
 insert into public.salon_publication_overrides(salon_id,application_id,reason,overridden_gates,gate_snapshot,granted_by)
 select a,x.id,'Isolated local acceptance fixture only',(select jsonb_agg(key) from jsonb_each(public.salon_publication_diagnostic(a)->'checks')),public.salon_publication_diagnostic(a),oa from public.salon_applications x where salon_id=a;
 update public.salons set status='Active',is_discoverable=true,owner_unpublished_at=null where id=a;
 perform pg_temp.massert(public.is_salon_profile_public(a),'real public eligibility fixture');

 src:=jsonb_build_object('photo_urls',jsonb_build_array('https://fixture.invalid/own.jpg'),'service_id',sa,'promotion_id',pa,'booking_id',booking_a);
 select jsonb_object_agg(l,jsonb_build_object('title','Braids '||l,'body','Own service, reviewed photo','tags',jsonb_build_array('#Braids'))) into copies from unnest(array['en','fr','es','zh-CN'])l;
 c:=jsonb_build_object('source',src,'copies',copies);
 select count(*) into notifications from public.notification_delivery_log;
 set local role service_role;
 perform pg_temp.mreject(format('select pg_temp.mdraft(%L,%L,%L,null,%L)',a,staff,'marketing_draft',c),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.mreject(format('select pg_temp.mdraft(%L,%L,%L,null,%L)',a,ob,'marketing_draft',c),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.mreject(format('select pg_temp.mdraft(%L,%L,%L,null,%L)',a,oa,'marketing_draft',jsonb_set(c,'{source,service_id}',to_jsonb(sb))),'ASSISTANT_PREVIEW_STALE');
 perform pg_temp.mreject(format('select pg_temp.mdraft(%L,%L,%L,null,%L)',a,oa,'marketing_draft',jsonb_set(c,'{source,photo_urls}','["https://fixture.invalid/foreign.jpg"]')),'ASSISTANT_PREVIEW_STALE');
 perform pg_temp.mreject(format('select pg_temp.mdraft(%L,%L,%L,null,%L)',a,oa,'marketing_draft',jsonb_set(c,'{copies}',copies-'fr')),'ASSISTANT_INVALID_INPUT');
 d:=pg_temp.mdraft(a,oa,'marketing_draft',null,c);post_id:=(d->>'id')::uuid;
 perform pg_temp.massert(not exists(select 1 from public.business_marketing_posts where id=post_id),'no mutation before confirmation');
 perform pg_temp.mreject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',post_id,a,oa,repeat('b',64)),'ASSISTANT_PREVIEW_STALE');
 r:=public.confirm_gc_assistant_request(post_id,a,oa,repeat('a',64));perform pg_temp.massert(r->'verified'='true' and r#>>'{result,status}'='draft','create draft '||r::text);
 perform pg_temp.massert((select business_marketing_posts.copies=c->'copies' and revision=1 and status='draft' from public.business_marketing_posts where id=post_id),'authoritative multilingual readback');
 r:=public.confirm_gc_assistant_request(post_id,a,oa,repeat('a',64));perform pg_temp.massert(r->'replayed'='true','lost response replay');
 perform pg_temp.massert((select count(*)=1 from public.gc_assistant_audit where request_id=post_id and event='confirmed'),'one confirmed audit');
 r:=public.read_gc_business_marketing(a,oa,post_id);perform pg_temp.massert(r#>>'{posts,0,id}'=post_id::text and not((r#>'{posts,0}')?'created_by'),'read no private actor identity');
 perform pg_temp.massert(r::text not like '%Private client%' and r::text not like '%private-a@example.test%','completed appointment source excludes client identity');
 perform pg_temp.mreject(format('select public.read_gc_business_marketing(%L,%L,%L)',b,ob,post_id),'ASSISTANT_RECORD_NOT_FOUND');
 r:=public.save_business_marketing_post(b,ob,gen_random_uuid(),0,jsonb_build_object('photo_urls','[]'::jsonb,'service_id',sb,'promotion_id',null,'booking_id',null),copies);foreign_id:=(r->>'id')::uuid;
 perform pg_temp.mreject(format('select pg_temp.mdraft(%L,%L,%L,%L,%L)',a,oa,'marketing_cancel',foreign_id,'{}'),'ASSISTANT_RECORD_NOT_FOUND');
 d:=pg_temp.mdraft(a,oa,'marketing_publish',post_id,jsonb_build_object('scheduled_at',now()+interval '1 hour','expires_at',now()+interval '1 day'));
 perform pg_temp.massert((select status='draft' from public.business_marketing_posts where id=post_id),'publish preview does not schedule');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.massert(r->'verified'='true' and r#>>'{result,status}'='scheduled','reviewed publication delegates canonical scheduler '||r::text);
 perform pg_temp.massert((select revision=2 and approved_revision=1 and approved_by=oa and approved_at is not null from public.business_marketing_posts where id=post_id),'canonical explicit review receipt');
 d:=pg_temp.mdraft(a,oa,'marketing_cancel',post_id,'{}');r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.massert(r->'verified'='true' and r#>>'{result,status}'='cancelled','withdraw readback');
 d:=pg_temp.mdraft(a,oa,'marketing_draft',post_id,c);
 perform public.save_business_marketing_post(a,oa,post_id,(select revision from public.business_marketing_posts where id=post_id),src,jsonb_set(copies,'{en,title}','"Concurrent edit"'));
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.massert(r->>'code'='ASSISTANT_PREVIEW_STALE','concurrent editor change is not overwritten');
 d:=pg_temp.mdraft(a,oa,'marketing_draft',null,c);
 reset role;
 update public.styles set base_price=200 where id=sa;
 set local role service_role;
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.massert(r->>'code'='ASSISTANT_PREVIEW_STALE','source price change invalidates preview');
 perform pg_temp.massert(not exists(select 1 from public.business_marketing_posts where id=(d->>'id')::uuid),'failed source check creates no draft');
 d:=pg_temp.mdraft(a,oa,'marketing_draft',null,c);
 reset role;
 update public.platform_identities set status='Disabled' where user_id=oa;
 set local role service_role;
 perform pg_temp.mreject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,oa,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 reset role;
 update public.platform_identities set status='Active' where user_id=oa;
 update public.gc_assistant_requests set expires_at=now()-interval '1 minute' where id=(d->>'id')::uuid;
 set local role service_role;
 perform pg_temp.mreject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,oa,repeat('a',64)),'ASSISTANT_PREVIEW_EXPIRED');
 perform pg_temp.massert((select business_marketing_posts.copies=c->'copies' and revision=1 from public.business_marketing_posts where id=foreign_id),'foreign record unchanged');
 perform pg_temp.massert((select count(*)=notifications from public.notification_delivery_log),'no customer notification');
 perform pg_temp.massert(not has_function_privilege('anon','public.read_gc_business_marketing(uuid,uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.confirm_gc_assistant_request(uuid,uuid,uuid,text)','EXECUTE'),'server-only private paths');
end $$;
select count(*) as passed_marketing_assertions from marketing_assertions;
rollback;
