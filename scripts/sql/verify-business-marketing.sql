-- Disposable local database only. Synthetic businesses, explicit publication
-- fixture overrides and every publication below roll back. No external sends.
\set ON_ERROR_STOP on
begin;
create function pg_temp.marketing_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Marketing assertion: %',label; end if; end $$;
create function pg_temp.marketing_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then rejected:=true;else raise;end if;end;
perform pg_temp.marketing_assert(rejected,expected);end $$;
do $$
declare oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();
 booking_a uuid:=gen_random_uuid();booking_b uuid:=gen_random_uuid();post_id uuid:=gen_random_uuid();scheduled_id uuid:=gen_random_uuid();
 src jsonb;copies jsonb; snap jsonb;r jsonb;again jsonb;listed jsonb;worker jsonb;events_before bigint;scheduled timestamptz:=now()+interval '1 hour'; expires timestamptz:=now()+interval '1 day';
begin
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
 perform pg_temp.marketing_assert(public.is_salon_profile_public(a),'real public eligibility fixture');
 src:=jsonb_build_object('photo_urls',jsonb_build_array('https://fixture.invalid/own.jpg'),'service_id',sa,'promotion_id',pa,'booking_id',booking_a);
 select jsonb_object_agg(l,jsonb_build_object('title','Owner reviewed service','body','Boho / Goddess Braids at Marketing A. USD 100–150. Deposit unchanged.','tags',jsonb_build_array('#GirlzCulture'))) into copies from unnest(array['en','fr','es','zh-CN']) l;
 perform set_config('request.jwt.claim.role','service_role',true);
 set local role service_role;
 snap:=public.business_marketing_snapshot(a,src);
 perform pg_temp.marketing_assert(snap->'service'->>'name'='Boho / Goddess Braids' and (snap->'service'->>'price_display_max')::numeric=150,'actual own service facts');
 perform pg_temp.marketing_assert(snap::text not like '%Private client%' and snap::text not like '%private-a@%' and snap::text not like '%Foreign%','no client identity or other business in projection');
 perform pg_temp.marketing_reject(format('select public.business_marketing_snapshot(%L,%L)',a,src||jsonb_build_object('service_id',sb)),'MARKETING_SOURCE_CHANGED');
 perform pg_temp.marketing_reject(format('select public.business_marketing_snapshot(%L,%L)',a,src||jsonb_build_object('photo_urls',jsonb_build_array('https://fixture.invalid/foreign.jpg'))),'MARKETING_SOURCE_CHANGED');
 perform pg_temp.marketing_reject(format('select public.business_marketing_snapshot(%L,%L)',a,src||jsonb_build_object('promotion_id',pb)),'MARKETING_SOURCE_CHANGED');
 perform pg_temp.marketing_reject(format('select public.business_marketing_snapshot(%L,%L)',a,src||jsonb_build_object('booking_id',booking_b)),'MARKETING_SOURCE_CHANGED');
 perform pg_temp.marketing_reject(format('select public.save_business_marketing_post(%L,%L,%L,0,%L,%L)',a,ob,post_id,src,copies),'MARKETING_FORBIDDEN');
 perform pg_temp.marketing_reject(format('select public.save_business_marketing_post(%L,%L,%L,0,%L,%L)',a,staff,post_id,src,copies),'MARKETING_FORBIDDEN');
 r:=public.save_business_marketing_post(a,oa,post_id,0,src,copies);
 again:=public.save_business_marketing_post(a,oa,post_id,0,src,copies);
 perform pg_temp.marketing_assert(r=again and (select count(*)=1 from public.business_marketing_events e where e.post_id=(r->>'id')::uuid),'saved retry has one revision/event');
 perform pg_temp.marketing_assert(public.public_business_marketing_posts(a)='[]','draft invisible publicly');
 perform pg_temp.marketing_assert(r->>'booking_path'='/salon/marketing-fixture-a/book?style='||sa||'&promotion='||pa,'canonical booking target binds selected records');
 perform pg_temp.marketing_reject(format('select public.approve_business_marketing_post(%L,%L,%L,1,now(),now()+interval ''1 day'',array[''en''],true)',a,oa,post_id),'MARKETING_REVIEW_REQUIRED');
 perform pg_temp.marketing_reject(format('select public.approve_business_marketing_post(%L,%L,%L,1,now(),now()+interval ''1 day'',array[''en'',''fr'',''es'',''zh-CN''],true)',b,ob,post_id),'MARKETING_NOT_FOUND');
 r:=public.approve_business_marketing_post(a,oa,post_id,1,now(),expires,array['en','fr','es','zh-CN'],true);
 again:=public.approve_business_marketing_post(a,oa,post_id,1,now(),expires,array['en','fr','es','zh-CN'],true);
 perform pg_temp.marketing_assert(r=again and r->>'status'='published','explicit approval and lost-response retry');
 listed:=public.public_business_marketing_posts(a);
 perform pg_temp.marketing_assert(jsonb_array_length(listed)=1 and listed->0->>'booking_path'=r->>'booking_path' and not listed->0 ? 'source' and not listed->0 ? 'snapshot' and not listed->0 ? 'created_by','public projection excludes internal records');
 perform pg_temp.marketing_assert(public.public_business_marketing_posts(b)='[]','another public page cannot see own post');
 set local role anon;
 perform pg_temp.marketing_assert(jsonb_array_length(public.public_business_marketing_posts(a))=1,'actual anonymous public function grants');
 set local role service_role;
 -- A changed price must immediately hide obsolete copy, even before worker runs.
 reset role;
 update public.styles set base_price=110,price_display_min=110 where id=sa;
 set local role service_role;
 perform pg_temp.marketing_assert(public.public_business_marketing_posts(a)='[]','stale price is never advertised');
 worker:=public.publish_due_business_marketing_posts();
 perform pg_temp.marketing_assert((select status='needs_review' from public.business_marketing_posts where id=post_id),'worker surfaces changed source for another owner review');
 -- Re-saving refreshed facts resets approval. A later worker must not publish
 -- the edited revision under an old confirmation.
 r:=public.save_business_marketing_post(a,oa,post_id,(select revision from public.business_marketing_posts where id=post_id),src,copies);
 perform pg_temp.marketing_assert(r->>'status'='draft' and r->>'approved_by' is null,'new draft resets approval');
 r:=public.save_business_marketing_post(a,oa,scheduled_id,0,src,copies);
 r:=public.approve_business_marketing_post(a,oa,scheduled_id,1,scheduled,expires,array['en','fr','es','zh-CN'],true);
 perform pg_temp.marketing_assert(r->>'status'='scheduled' and public.public_business_marketing_posts(a)='[]','future approval stays unpublished');
 worker:=public.publish_due_business_marketing_posts();
 perform pg_temp.marketing_assert((worker->>'published')::int=0,'early worker cannot publish');
 -- Advance the persisted due timestamp in this local fixture only.
 update public.business_marketing_posts set scheduled_at=now()-interval '1 minute' where id=scheduled_id;
 worker:=public.publish_due_business_marketing_posts();
 select count(*) into events_before from public.business_marketing_events e where e.post_id=scheduled_id;
 perform public.publish_due_business_marketing_posts();
 perform pg_temp.marketing_assert((worker->>'published')::int=1 and (select count(*)=events_before from public.business_marketing_events e where e.post_id=scheduled_id),'due publishing and repeat worker do not duplicate');
 -- Revocation of owner identity must hide already-approved content immediately.
 reset role;
 update public.platform_identities set status='Disabled' where user_id=oa;
 set local role service_role;
 perform pg_temp.marketing_assert(public.public_business_marketing_posts(a)='[]','disabled owner content fails closed');
 perform public.publish_due_business_marketing_posts();
 perform pg_temp.marketing_assert((select status='needs_review' from public.business_marketing_posts where id=scheduled_id),'worker stops revoked approval');
 reset role;
 update public.platform_identities set status='Active' where user_id=oa;
 set local role service_role;
 r:=public.save_business_marketing_post(a,oa,scheduled_id,(select revision from public.business_marketing_posts where id=scheduled_id),src,copies);
 r:=public.approve_business_marketing_post(a,oa,scheduled_id,(r->>'revision')::int,now(),expires,array['en','fr','es','zh-CN'],true);
 update public.business_marketing_posts set scheduled_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=scheduled_id;
 perform pg_temp.marketing_assert(public.public_business_marketing_posts(a)='[]','expired post hidden immediately');
 perform public.publish_due_business_marketing_posts();
 perform pg_temp.marketing_assert((select status='expired' from public.business_marketing_posts where id=scheduled_id),'expired post truthfully recorded');
 r:=public.cancel_business_marketing_post(a,oa,post_id,(select revision from public.business_marketing_posts where id=post_id));
 again:=public.cancel_business_marketing_post(a,oa,post_id,(r->>'revision')::int-1);
 perform pg_temp.marketing_assert(r=again and r->>'status'='cancelled','cancel readback and replay');
 raise notice 'Marketing source isolation, real role, review, idempotency, scheduling, revocation, expiry and public projection passed';
end $$;
reset role;
do $$ begin
 perform pg_temp.marketing_assert(not has_table_privilege('anon','public.business_marketing_posts','select') and not has_table_privilege('authenticated','public.business_marketing_events','select'),'private table grants');
 perform pg_temp.marketing_assert(not has_function_privilege('authenticated','public.save_business_marketing_post(uuid,uuid,uuid,integer,jsonb,jsonb)','execute'),'browser cannot forge owner RPC');
 perform pg_temp.marketing_assert(not has_function_privilege('anon','public.business_marketing_snapshot(uuid,jsonb)','execute'),'public role cannot read private source');
 perform pg_temp.marketing_assert(has_function_privilege('anon','public.public_business_marketing_posts(uuid)','execute'),'public caller only receives narrow approved projection');
end $$;
rollback;
