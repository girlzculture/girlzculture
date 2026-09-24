-- Disposable, rolled-back fixtures. No provider credentials or notifications.
begin;
create temporary table fulfillment_assertions(label text);grant select,insert on fulfillment_assertions to service_role;
create function pg_temp.fassert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assistant fulfillment: %',label;end if;insert into fulfillment_assertions values(label);end $$;
create function pg_temp.freject(command text,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then denied:=true;else raise;end if;end;perform pg_temp.fassert(denied,expected);end $$;
create function pg_temp.fdraft(b uuid,a uuid,target uuid,status text,carrier text default null,tracking text default null) returns jsonb language plpgsql as $$declare preview jsonb;args jsonb;begin
 args:=jsonb_build_object('operation','product_fulfillment','record_id',target,'changes_json',jsonb_build_object('fulfillment_status',status,'carrier',carrier,'tracking_number',tracking,'note','Reviewed in assistant')::text);preview:=public.preview_gc_business_operation(b,a,args);
 return public.save_gc_assistant_request(jsonb_build_object('id',gen_random_uuid(),'salon_id',b,'requested_by',a,'locale','en','tool','prepare_stock_change','arguments',args,'execution_payload',preview->'payload','before_summary',preview->'before','risk_class',4,'permission','products','digest',repeat('a',64)),'[]'::jsonb);
end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();orders uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];intent uuid;n integer;d jsonb;r jsonb;before_order jsonb;notifications bigint;events bigint;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(oa,'fulfillment-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'fulfillment-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'fulfillment-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier)values(a,oa,'Fulfillment A','fulfillment-a','fulfillment-a@example.test','Active','active','Premium'),(b,ob,'Fulfillment B','fulfillment-b','fulfillment-b@example.test','Active','active','Premium');
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions)values(a,staff,'fulfillment-staff@example.test','Limited','Staff','Active','{"products":true}');
 insert into public.salon_products(id,salon_id,name,price,inventory_quantity,track_inventory)values(pa,a,'Original Oil',20,10,true),(pb,b,'Private B',99,50,true);
 for n in 1..6 loop
  intent:=gen_random_uuid();
  insert into public.commerce_checkout_intents(id,salon_id,guest_name,guest_email,fulfillment_method,idempotency_key)values(intent,case when n=6 then b else a end,'Invented buyer','fictional@example.test',case when n=1 then 'Shipping' else 'Pickup' end,intent::text);
  insert into public.product_orders(id,commerce_intent_id,salon_id,guest_name,guest_email,fulfillment_method,fulfillment_status,reservation_status,subtotal,total_amount)
   values(orders[n],intent,case when n=6 then b else a end,'Invented buyer','fictional@example.test',case when n=1 then 'Shipping' else 'Pickup' end,case when n in(2,3) then 'Reserved' else 'New' end,case when n in(2,3) then 'Reserved' else null end,40,40);
  insert into public.product_order_items(order_id,product_id,product_name,unit_price,quantity,line_total)values(orders[n],case when n=6 then pb else pa end,'Original Oil',20,2,40);
 end loop;
 select count(*) into notifications from public.notification_delivery_log;
 perform set_config('request.jwt.claim.role','service_role',true);set local role service_role;
 perform pg_temp.freject(format('select pg_temp.fdraft(%L,%L,%L,''Preparing'')',b,oa,orders[6]),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.freject(format('select pg_temp.fdraft(%L,%L,%L,''Preparing'')',a,oa,orders[6]),'ASSISTANT_RECORD_NOT_FOUND');
 perform pg_temp.freject(format('select pg_temp.fdraft(%L,%L,%L,''Cancelled'')',a,oa,orders[1]),'ASSISTANT_INVALID_INPUT');
 perform pg_temp.freject(format('select pg_temp.fdraft(%L,%L,%L,''Refunded'')',a,oa,orders[1]),'ASSISTANT_INVALID_INPUT');
 perform pg_temp.freject(format('select pg_temp.fdraft(%L,%L,%L,''Shipped'')',a,oa,orders[1]),'ASSISTANT_PREVIEW_STALE');
 d:=pg_temp.fdraft(a,staff,orders[1],'Preparing');reset role;
 perform pg_temp.fassert((select fulfillment_status='New' from public.product_orders where id=orders[1]),'review does not mutate order');
 perform pg_temp.fassert(d->'execution_payload'->>'provider_action'='false' and d->'execution_payload'->>'notification_sent'='false','review discloses status-only boundary');
 perform pg_temp.freject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,staff,repeat('b',64)),'ASSISTANT_PREVIEW_STALE');
 select to_jsonb(o)-array['fulfillment_status','carrier','tracking_number','fulfillment_note','fulfilled_at','updated_at'] into before_order from public.product_orders o where id=orders[1];
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,staff,repeat('a',64));perform pg_temp.fassert(r->>'verified'='true','permitted staff confirm '||r::text);
 perform pg_temp.fassert((select fulfillment_status='Preparing' from public.product_orders where id=orders[1]),'preparing authoritative readback');
 perform pg_temp.freject(format('select pg_temp.fdraft(%L,%L,%L,''Shipped'')',a,oa,orders[1]),'ASSISTANT_INVALID_INPUT');
 perform pg_temp.freject(format('select pg_temp.fdraft(%L,%L,%L,''Ready for Pickup'')',a,oa,orders[1]),'ASSISTANT_PREVIEW_STALE');
 d:=pg_temp.fdraft(a,oa,orders[1],'Shipped','Local carrier','TEST-TRACKING-001');r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));
 perform pg_temp.fassert(r->>'verified'='true' and r->'result'->>'tracking_number'='TEST-TRACKING-001','shipping tracking readback');
 select count(*) into events from public.product_order_events where order_id=orders[1];
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.fassert(r->>'replayed'='true' and (select count(*)=events from public.product_order_events where order_id=orders[1]),'replay creates no duplicate event');
 d:=pg_temp.fdraft(a,oa,orders[1],'Delivered');r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));
 perform pg_temp.fassert(r->>'verified'='true' and (select fulfilled_at is not null and carrier='Local carrier' and tracking_number='TEST-TRACKING-001' from public.product_orders where id=orders[1]),'delivery preserves shipment and stamps completion');
 perform pg_temp.fassert((select to_jsonb(o)-array['fulfillment_status','carrier','tracking_number','fulfillment_note','fulfilled_at','updated_at']=before_order from public.product_orders o where id=orders[1]),'payment amounts provider references and customer details unchanged');
 d:=pg_temp.fdraft(a,oa,orders[2],'Ready for pickup');r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.fassert(r->>'verified'='true' and (select reservation_status='Ready for pickup' from public.product_orders where id=orders[2]),'reservation ready');
 d:=pg_temp.fdraft(a,oa,orders[2],'Collected');r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.fassert(r->>'verified'='true' and (select fulfilled_at is not null and reservation_status='Collected' from public.product_orders where id=orders[2]),'collection canonical readback');
 d:=pg_temp.fdraft(a,oa,orders[3],'Not collected');r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.fassert(r->>'verified'='true' and (select inventory_quantity=12 from public.salon_products where id=pa),'uncollected stock restored once');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.fassert(r->>'replayed'='true' and (select inventory_quantity=12 from public.salon_products where id=pa),'replayed release cannot restore stock twice');
 d:=pg_temp.fdraft(a,oa,orders[4],'Preparing');reset role;
 update public.product_orders set fulfillment_note='Changed elsewhere' where id=orders[4];
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.fassert(r->>'code'='ASSISTANT_PREVIEW_STALE' and (select fulfillment_status='New' from public.product_orders where id=orders[4]),'late order update is retained and rejects stale preview');
 d:=pg_temp.fdraft(a,staff,orders[4],'Preparing');reset role;update public.salon_team_members set permissions='{}' where salon_id=a and user_id=staff;
 perform pg_temp.freject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,staff,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 d:=pg_temp.fdraft(a,oa,orders[4],'Preparing');reset role;update public.gc_assistant_requests set expires_at=now()-interval '1 minute' where id=(d->>'id')::uuid;
 perform pg_temp.freject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,oa,repeat('a',64)),'ASSISTANT_PREVIEW_EXPIRED');
 reset role;update public.product_order_items set product_id=pb where order_id=orders[5];
 perform pg_temp.freject(format('select pg_temp.fdraft(%L,%L,%L,''Preparing'')',a,oa,orders[5]),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.fassert((select fulfillment_status='New' from public.product_orders where id=orders[6]) and (select inventory_quantity=50 from public.salon_products where id=pb),'foreign business unchanged');
 perform pg_temp.fassert((select count(*)=notifications from public.notification_delivery_log),'no notifications sent');
 perform pg_temp.fassert(not has_function_privilege('authenticated','public.preview_gc_product_fulfillment(uuid,uuid,jsonb)','execute') and not has_function_privilege('anon','public.confirm_gc_assistant_request(uuid,uuid,uuid,text)','execute'),'raw RPC denied');
 perform pg_temp.freject(format('select public.preview_gc_business_operation(%L,%L,%L)',a,oa,jsonb_build_object('operation','product_fulfillment','record_id',orders[4],'changes_json','{"fulfillment_status":"Preparing","carrier":null,"tracking_number":null,"note":null,"refund":true}')::text),'ASSISTANT_INVALID_INPUT');
end $$;
select count(*)||' assistant fulfillment database assertions passed' from fulfillment_assertions;
rollback;
