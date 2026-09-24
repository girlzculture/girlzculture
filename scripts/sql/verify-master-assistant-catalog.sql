-- Local disposable fixtures: no real provider, payment or customer notification.
begin;
create temporary table operation_assertions(label text);grant select,insert on operation_assertions to service_role;
create function pg_temp.oassert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assistant operations: %',label;end if;insert into operation_assertions values(label);end $$;
create function pg_temp.oreject(command text,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then denied:=true;else raise;end if;end;perform pg_temp.oassert(denied,expected);end $$;
create function pg_temp.cdraft(b uuid,a uuid,tool text,target uuid,changes jsonb) returns jsonb language plpgsql as $$declare preview jsonb;args jsonb;begin
 args:=jsonb_build_object('record_id',target,'changes_json',changes::text);preview:=public.preview_gc_catalog_change(b,a,tool,args);
 return public.save_gc_assistant_request(jsonb_build_object('id',gen_random_uuid(),'salon_id',b,'requested_by',a,'locale','en','tool',tool,'arguments',args,'execution_payload',preview->'payload','before_summary',preview->'before','risk_class',4,'permission',case tool when 'prepare_service_change' then 'styles' when 'prepare_professional_change' then 'stylists' when 'prepare_product_change' then 'products' else 'promotions' end,'digest',repeat('a',64)),'[]'::jsonb);
end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();service uuid:=gen_random_uuid();serviceb uuid:=gen_random_uuid();booka uuid:=gen_random_uuid();bookb uuid:=gen_random_uuid();reviewa uuid:=gen_random_uuid();reviewb uuid:=gen_random_uuid();supply uuid;d jsonb;r jsonb;again jsonb;v jsonb;op text;n bigint;notifications bigint;master_id uuid;new_id uuid;hours jsonb;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(oa,'operations-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'operations-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'operations-staff@example.test','',now(),'{"role":"salon_team"}'),(customer,'operations-customer@example.test','',now(),'{"role":"customer"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.customers(id,name,email)values(customer,'Invented customer','operations-customer@example.test');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,gallery_photos,cover_photo_url)values(a,oa,'Operations A','operations-a','operations-a@example.test','Active','active','Premium','["https://example.test/a.jpg","https://example.test/a2.jpg"]'::jsonb,'https://example.test/a.jpg'),(b,ob,'Operations B','operations-b','operations-b@example.test','Active','active','Premium','["https://example.test/b.jpg"]'::jsonb,'https://example.test/b.jpg');
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions)values(a,staff,'operations-staff@example.test','Limited','Staff','Active','{"products":true,"client_history":true,"client_edit":true}');
 insert into public.salon_products(id,salon_id,name,price,inventory_quantity,track_inventory)values(pa,a,'Oil A',20,10,true),(pb,b,'Private B',99,50,true);
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price)select service,a,id,'Service A',1,1,100 from public.service_groups where is_active limit 1;
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price)select serviceb,b,id,'Service B',1,1,999 from public.service_groups where is_active limit 1;
 insert into public.bookings(id,salon_id,style_id,customer_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status)values(booka,a,service,customer,'Invented customer',now()-interval '2 days',1,100,0,100,'Not paid','Completed'),(bookb,b,serviceb,customer,'Invented customer',now()-interval '3 days',1,999,0,999,'Not paid','Completed');
 insert into public.reviews(id,booking_id,salon_id,customer_id,rating_overall,written_review,display_name) values(reviewa,booka,a,customer,5,'Review A','Sample'),(reviewb,bookb,b,customer,1,'Private B review','Sample');
 select count(*) into notifications from public.notification_delivery_log;
 perform set_config('request.jwt.claim.role','service_role',true);
 

 perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,oa,'prepare_product_change',jsonb_build_object('record_id',pb,'changes_json','{"price":42}')),'ASSISTANT_RECORD_NOT_FOUND');
 perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,staff,'prepare_service_change',jsonb_build_object('record_id',service,'changes_json','{"base_price":42}')),'ASSISTANT_ACCESS_DENIED');
 for v in select * from (values ('{"salon_id":"00000000-0000-4000-8000-000000000000"}'::jsonb),('{"price":-1}'::jsonb),('{"is_visible":"true"}'::jsonb),('{"inventory_quantity":3}'::jsonb),('{"price":null}'::jsonb)) input(value) loop
  perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,oa,'prepare_product_change',jsonb_build_object('record_id',pa,'changes_json',v::text)),'ASSISTANT_INVALID_INPUT');
 end loop;
 d:=pg_temp.cdraft(a,oa,'prepare_service_change',service,'{"base_price":120,"price_display_min":120,"price_display_max":120,"description":"Reviewed service","is_draft":false}');
 perform pg_temp.oassert((select base_price=100 from public.styles where id=service),'prepare performs no change');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->'verified'='true',r::text);
 perform pg_temp.oassert((select base_price=120 and description='Reviewed service' and not is_draft from public.styles where id=service),'public service edit readback');
 again:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(again->'replayed'='true' and again->'result'=r->'result','durable exact replay');
 -- Price options/materials match the canonical manual editor and bind exact
 -- current rows into the review. Every fixture rolls back.
 insert into public.service_addons(category_id,name,is_active) select category_id,'Scalp treatment',true from public.styles where id=service on conflict do nothing;
 insert into public.style_materials(style_id,name,price,longevity_weeks,quality_grade)values(service,'Kanekalon (standard)',5,4,'Good');

 -- Published editor choices and SQL/assistant validation share one source.
 update public.engine_settings set published_value='["Good","Better","Premium","Luxury"]',draft_value='["Draft only"]' where setting_key='catalog.material_quality_grades';
 update public.style_materials set quality_grade='Premium' where style_id=service;
 perform pg_temp.oassert((select bool_and(quality_grade='Premium' and quality_note='Premium') from public.style_materials where style_id=service),'manual material save accepts published Premium unchanged');
 perform pg_temp.oreject(format('update public.style_materials set quality_grade=%L where style_id=%L','Draft only',service),'valid braiding quality');
 perform pg_temp.oreject(format('update public.style_materials set quality_grade=%L where style_id=%L','Unpublished',service),'valid braiding quality');
 d:=pg_temp.cdraft(a,oa,'prepare_service_change',service,'{"style_materials":[{"name":"Kanekalon (standard)","price":6,"longevity_weeks":4,"quality_grade":"Premium"}]}');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));
 perform pg_temp.oassert(r->'verified'='true' and (select bool_and(quality_grade='Premium' and price=6) from public.style_materials where style_id=service),'assistant Premium confirmation uses canonical unchanged grade');
 d:=pg_temp.cdraft(a,oa,'prepare_service_change',service,'{"style_materials":[{"name":"Kanekalon (standard)","price":7,"longevity_weeks":4,"quality_grade":"Premium"}]}');
 update public.engine_settings set published_value='["Good","Better","Luxury"]' where setting_key='catalog.material_quality_grades';
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));
 perform pg_temp.oassert(r->>'code'='ASSISTANT_CATALOG_CLARIFICATION_REQUIRED' and (select bool_and(price=6) from public.style_materials where style_id=service),'withdrawn managed grade invalidates pending review before a write');
 update public.engine_settings set published_value='["Good","Better","Premium","Luxury"]' where setting_key='catalog.material_quality_grades';
 perform pg_temp.oassert(public.valid_braiding_material_quality('Best') and not public.valid_braiding_material_quality(null),'saved legacy Best retained, missing grade rejected');
 update public.style_materials set price=5,quality_grade='Good' where style_id=service;
 for v in select * from (values ('{"size_options":[{"label":"","price_add":5}]}'::jsonb),('{"size_options":[{"label":"A","price_add":-1}]}'::jsonb),('{"addons":[{"label":"A","price_add":5,"salon_id":"00000000-0000-4000-8000-000000000000"}]}'::jsonb),('{"style_materials":[{"name":"A","price":5,"longevity_weeks":13,"quality_grade":"Good"}]}'::jsonb),('{"style_materials":[{"name":"A","price":5,"quality_grade":"Good"}]}'::jsonb),('{"style_materials":null}'::jsonb),('{"style_materials":[{"name":42,"price":5,"longevity_weeks":4,"quality_grade":"Good"}]}'::jsonb)) input(value) loop
  perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,oa,'prepare_service_change',jsonb_build_object('record_id',service,'changes_json',v::text)),'ASSISTANT_INVALID_INPUT');
 end loop;
 perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,oa,'prepare_service_change',jsonb_build_object('record_id',service,'changes_json','{"addons":[{"label":"Not a managed addon","price_add":5}]}')),'ASSISTANT_CATALOG_CLARIFICATION_REQUIRED');
 set local role service_role;
 d:=pg_temp.cdraft(a,oa,'prepare_service_change',service,'{"size_options":[{"label":"Small","price_add":20}],"length_options":[{"label":"Waist","price_add":30}],"addons":[{"label":"Scalp treatment","price_add":15}],"included_items":["Wash original"],"style_materials":[{"name":" Kanekalon (standard) ","price":25,"longevity_weeks":6,"quality_grade":" Best "}]}');
 perform pg_temp.oassert(d#>>'{execution_payload,materials,0,name}'='Kanekalon (standard)' and d#>>'{execution_payload,changes,style_materials,0,quality_grade}'='Best','normalized canonical material strings displayed before confirmation');
 reset role;
 perform pg_temp.oassert((select price=5 from public.style_materials where style_id=service),'preparing options never writes materials');
 set local role service_role;
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->'verified'='true',r::text);
 again:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(again->'replayed'='true','materials response-loss replay');
 reset role;
 perform pg_temp.oassert((select size_options='[{"label":"Small","price_add":20}]' and length_options='[{"label":"Waist","price_add":30}]' and addons='[{"label":"Scalp treatment","price_add":15}]' and included_items=array['Wash original'] and base_price=120 from public.styles where id=service),'all reviewed options persisted without changing base price');
 perform pg_temp.oassert((select count(*)=1 and bool_and(price=25 and longevity_weeks=6 and quality_grade='Best' and option_type='material') from public.style_materials where style_id=service),'canonical material metadata and one row after replay');
 perform pg_temp.oassert((select estimated_total=100 and duration_hours=1 from public.bookings where id=booka),'historical appointment price and duration unchanged');
 d:=pg_temp.cdraft(a,oa,'prepare_service_change',service,'{"description":"Options preserved"}');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->'verified'='true',r::text);
 perform pg_temp.oassert((select count(*)=1 and bool_and(price=25) from public.style_materials where style_id=service),'unrequested material edits never delete materials');
 d:=pg_temp.cdraft(a,oa,'prepare_service_change',service,'{"style_materials":[{"name":"X-Pression (premium)","price":35,"longevity_weeks":4,"quality_grade":"Good"}]}');
 update public.style_materials set price=26 where style_id=service;
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->>'code'='ASSISTANT_PREVIEW_STALE','concurrent material changes invalidate review');
 perform pg_temp.oassert((select price=26 from public.style_materials where style_id=service),'stale material review cannot overwrite editor');
 d:=pg_temp.cdraft(a,oa,'prepare_service_change',service,'{"style_materials":[],"size_options":[]}');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->'verified'='true',r::text);
 perform pg_temp.oassert(not exists(select 1 from public.style_materials where style_id=service) and (select size_options='[]' and jsonb_array_length(length_options)=1 from public.styles where id=service),'explicit clearing removes only selected options/materials');
 d:=pg_temp.cdraft(a,oa,'prepare_product_change',pa,'{"price":22}');
 update public.salon_products set description='Concurrent editor' where id=pa;
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->>'code'='ASSISTANT_PREVIEW_STALE','concurrent unrelated edit invalidates review');
 perform pg_temp.oassert((select price=20 from public.salon_products where id=pa),'stale action does not write');
 -- Invoke the actual RPCs with the service DB role; test fixture setup and
 -- authoritative readback remain under the disposable database administrator.
 set local role service_role;
 d:=pg_temp.cdraft(a,staff,'prepare_product_change',pa,'{"price":21}');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,staff,repeat('a',64));
 perform pg_temp.oassert(r->'verified'='true','service-role RPC and permitted staff action');
 reset role;
 perform pg_temp.oassert((select price=21 from public.salon_products where id=pa),'staff change authoritative readback');
 d:=pg_temp.cdraft(a,staff,'prepare_product_change',pa,'{"price":23}');
 update public.salon_team_members set permissions='{}' where salon_id=a and user_id=staff;
 perform pg_temp.oreject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,staff,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 select id into master_id from public.master_styles where is_active limit 1;
 d:=pg_temp.cdraft(a,oa,'prepare_service_change',null,jsonb_build_object('name',(select name from public.master_styles where id=master_id),'master_style_id',master_id,'base_price',75,'duration_min_hours',1,'duration_max_hours',1.5,'is_draft',false));
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->'verified'='true',r::text);new_id:=(r->'result'->>'record_id')::uuid;
 perform pg_temp.oassert((select salon_id=a and base_price=75 and price_display_min=75 and price_display_max=75 and service_group_id is not null and not is_draft from public.styles where id=new_id),'new published service derives catalog links and saved range');
 d:=pg_temp.cdraft(a,oa,'prepare_professional_change',null,jsonb_build_object('name','Invented professional','bio','Reviewed bio','is_draft',false,'assigned_service_ids',jsonb_build_array(service)));
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->'verified'='true',r::text);new_id:=(r->'result'->>'record_id')::uuid;
 perform pg_temp.oassert((select salon_id=a and not is_draft and is_active and assigned_service_ids=array[service] from public.stylists where id=new_id),'published professional and own assignments');
 perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,oa,'prepare_professional_change',jsonb_build_object('record_id',new_id,'changes_json',jsonb_build_object('assigned_service_ids',jsonb_build_array(serviceb))::text)),'ASSISTANT_RECORD_NOT_FOUND');

 select jsonb_object_agg(day,jsonb_build_object('open','09:30','close','17:15','closed',day='Sun')) into hours from unnest(array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])day;
 d:=pg_temp.cdraft(a,oa,'prepare_professional_change',new_id,jsonb_build_object('availability',hours));
 perform pg_temp.oassert((select availability is null or availability<>hours from public.stylists where id=new_id),'schedule preparation read only');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->'verified'='true','weekly schedule confirmation '||r::text);
 perform pg_temp.oassert((select availability=hours from public.stylists where id=new_id),'seven exact days readback');
 perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,oa,'prepare_professional_change',jsonb_build_object('record_id',new_id,'changes_json',jsonb_build_object('availability',hours-'Sun')::text)),'ASSISTANT_INVALID_INPUT');
 perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,oa,'prepare_professional_change',jsonb_build_object('record_id',new_id,'changes_json',jsonb_build_object('availability',jsonb_set(hours,'{Mon,close}','"08:00"'))::text)),'ASSISTANT_INVALID_INPUT');
 d:=pg_temp.cdraft(a,oa,'prepare_professional_change',new_id,'{"availability":null}');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->'verified'='true','restore inherited business hours '||r::text);
 perform pg_temp.oassert((select availability='{}'::jsonb from public.stylists where id=new_id),'inheritance readback');
 update public.salon_team_members set stylist_id=new_id,permissions='{"stylists":true,"styles":true}' where salon_id=a and user_id=staff;
 set local role service_role;

 perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,staff,'prepare_professional_change',jsonb_build_object('record_id',new_id,'changes_json',jsonb_build_object('availability',hours)::text)),'ASSISTANT_ACCESS_DENIED');
 reset role;
 update public.salon_team_members set permissions=permissions||'{"availability":true}' where salon_id=a and user_id=staff;
 set local role service_role;
 d:=pg_temp.cdraft(a,staff,'prepare_professional_change',new_id,jsonb_build_object('availability',hours));
 reset role;
 update public.salon_team_members set permissions=permissions-'availability' where salon_id=a and user_id=staff;
 set local role service_role;
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,staff,repeat('a',64));perform pg_temp.oassert(r->'verified'='false' and r->>'code'='ASSISTANT_ACCESS_DENIED','revoked scheduling grant denies confirmation');
 r:=public.preview_gc_catalog_change(a,staff,'prepare_professional_change',jsonb_build_object('record_id',new_id,'changes_json','{"bio":"Own updated biography"}'));
 perform pg_temp.oassert(r->>'salon_id'=a::text,'linked staff may review own professional');
 perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,staff,'prepare_professional_change',jsonb_build_object('record_id',null,'changes_json','{"name":"Extra professional"}')),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,staff,'prepare_professional_change',jsonb_build_object('record_id',pb,'changes_json','{"bio":"Other professional"}')),'ASSISTANT_ACCESS_DENIED');
 reset role;
 d:=pg_temp.cdraft(a,oa,'prepare_product_change',null,'{"name":"Reviewed product","price":35,"product_status":"Active","is_visible":true,"pickup_enabled":true,"in_person_only":false}');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->'verified'='true',r::text);new_id:=(r->'result'->>'record_id')::uuid;
 perform pg_temp.oassert((select salon_id=a and price=35 and product_status='Active' and is_visible and pickup_enabled and inventory_quantity=0 from public.salon_products where id=new_id),'product published without fabricated inventory');
 d:=pg_temp.cdraft(a,oa,'prepare_promotion_change',null,jsonb_build_object('title','Sample reviewed offer','promotion_type','percentage','discount_value',20,'starts_at',now(),'ends_at',now()+interval '2 days','timezone','America/New_York','status','Active','target_scope','services','target_ids',jsonb_build_array(service)));
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->'verified'='true',r::text);new_id:=(r->'result'->>'record_id')::uuid;
 perform pg_temp.oassert((select salon_id=a and status='Active' and is_active and discount_value=20 from public.salon_promotions where id=new_id),'offer publication readback');
 perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,oa,'prepare_promotion_change',jsonb_build_object('record_id',new_id,'changes_json','{"discount_value":101}')),'ASSISTANT_INVALID_INPUT');
 perform pg_temp.oreject(format('select public.preview_gc_catalog_change(%L,%L,%L,%L)',a,oa,'prepare_promotion_change',jsonb_build_object('record_id',new_id,'changes_json',jsonb_build_object('target_ids',jsonb_build_array(serviceb))::text)),'ASSISTANT_RECORD_NOT_FOUND');
 d:=pg_temp.cdraft(a,oa,'prepare_promotion_change',new_id,'{"status":"Paused"}');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.oassert(r->'verified'='true',r::text);
 perform pg_temp.oassert((select status='Paused' and not is_active from public.salon_promotions where id=new_id),'pause preserves original offer');
 perform pg_temp.oassert((select price=99 and inventory_quantity=50 from public.salon_products where id=pb),'second business data preserved');
 perform pg_temp.oassert((select count(*)=notifications from public.notification_delivery_log),'no notifications');
 
 perform pg_temp.oassert(not has_function_privilege('authenticated','public.preview_gc_catalog_change(uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.confirm_gc_assistant_request(uuid,uuid,uuid,text)','EXECUTE'),'no browser bypass');
end $$;
select count(*) as passed_catalog_assertions from operation_assertions;
rollback;
