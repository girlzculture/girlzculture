-- Synthetic records only, always rolled back.
begin;
create function pg_temp.stock_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Stock assertion failed: %',label;end if;end $$;
create function pg_temp.stock_reject(command text,expected text) returns void language plpgsql as $$
declare denied boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then denied:=true;else raise;end if;end;perform pg_temp.stock_assert(denied,expected);end $$;
do $$
declare oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();sa uuid;req uuid:=gen_random_uuid();payload jsonb;result jsonb;prior_count integer;rev bigint;sale uuid;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(oa,'stock-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'stock-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'stock-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier) values(a,oa,'Stock A','stock-a','stock-a@example.test','Active','active','Premium'),(b,ob,'Stock B','stock-b','stock-b@example.test','Active','active','Premium');
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions) values(a,staff,'stock-staff@example.test','Stock clerk','Front Desk','Active','{"products":true,"finance_log":true}');
 insert into public.salon_products(id,salon_id,name,price,track_inventory,inventory_quantity) values(pa,a,'Oil A',25,true,10),(pb,b,'Oil B',40,true,40);
 perform set_config('request.jwt.claim.role','service_role',true);
 payload:=jsonb_build_object('product_id',pa,'expected_revision',1,'quantity',5,'cost_cents',2000,'note','Retail purchase');
 result:=public.record_business_stock(a,oa,req,'restock',payload);
 perform pg_temp.stock_assert(result->>'quantity'='15','restock current stock');
 perform pg_temp.stock_assert(public.record_business_stock(a,oa,req,'restock',payload)=result,'retry returns same result');
 perform pg_temp.stock_assert((select count(*)=1 and min(treatment)='inventory_asset' from public.business_finance_expenses where salon_id=a),'retail purchase logged once, not operating profit');
 perform pg_temp.stock_assert((select count(*)=2 from public.business_stock_movements where product_id=pa),'opening plus one restock');
 perform pg_temp.stock_reject(format('select public.record_business_stock(%L,%L,%L,''correction'',%L::jsonb)',a,oa,gen_random_uuid(),jsonb_build_object('product_id',pa,'expected_revision',1,'quantity',20,'note','stale count')),'STOCK_REVISION_CONFLICT');
 perform pg_temp.stock_reject(format('select public.record_business_stock(%L,%L,%L,''restock'',%L::jsonb)',a,oa,gen_random_uuid(),jsonb_build_object('product_id',pb,'expected_revision',1,'quantity',2)),'STOCK_RECORD_NOT_FOUND');
 perform pg_temp.stock_reject(format('select public.read_business_stock(%L,%L)',b,oa),'STOCK_ACCESS_DENIED');
 perform pg_temp.stock_assert(public.read_business_stock(a,oa)::text not like '%Oil B%','read excludes foreign public and private inventory');
 perform pg_temp.stock_assert(public.read_business_stock(b,ob)::text not like '%Oil A%','reverse business isolation');
 result:=public.record_business_stock(a,oa,gen_random_uuid(),'create_supply','{"name":"Gloves","unit":"boxes","quantity":2,"low_stock_threshold":3}');sa:=(result->>'id')::uuid;
 perform pg_temp.stock_assert((public.read_business_stock(a,oa)->'supplies'->0->>'inventory_quantity')::integer=2,'supplies persisted separately from retail');
 perform public.record_business_stock(a,oa,gen_random_uuid(),'restock',jsonb_build_object('supply_id',sa,'expected_revision',1,'quantity',3,'cost_cents',1500));
 perform public.record_business_stock(a,oa,gen_random_uuid(),'consumption',jsonb_build_object('supply_id',sa,'expected_revision',2,'quantity',1));
 perform pg_temp.stock_assert((select inventory_quantity=4 from public.business_supplies where id=sa),'supply restock and consumption');
 perform pg_temp.stock_assert((select count(*)=1 from public.business_finance_expenses where salon_id=a and treatment='operating' and amount_cents=1500),'supplies expenses enter operating costs once');
 perform pg_temp.stock_reject(format('select public.record_business_stock(%L,%L,%L,''restock'',%L::jsonb)',a,staff,gen_random_uuid(),jsonb_build_object('product_id',pa,'expected_revision',2,'quantity',2,'cost_cents',100)),'STOCK_FINANCE_PERMISSION_REQUIRED');
 -- Offline sale snapshots identity; idempotent retry does not deduct twice.
 req:=gen_random_uuid();payload:=jsonb_build_object('kind','product','product_id',pa,'name','Forged display name','source','walk_in','list_cents',5000,'quantity',2,'method','cash','cost_cents',1000);
 result:=public.record_business_finance(a,staff,req,'sale',payload);sale:=(result->>'id')::uuid;
 perform pg_temp.stock_assert(public.record_business_finance(a,staff,req,'sale',payload)=result,'sale retry idempotent');
 perform pg_temp.stock_assert((select inventory_quantity=13 from public.salon_products where id=pa),'two sold units deducted once');
 perform pg_temp.stock_assert((select name='Oil A' and product_id=pa and quantity=2 and list_cents=5000 from public.business_finance_sales where id=sale),'canonical own product, quantity and total recorded');
 perform pg_temp.stock_assert((select count(*)=1 from public.business_stock_movements where sale_id=sale),'one linked movement');
 perform pg_temp.stock_reject(format('select public.record_business_finance(%L,%L,%L,''sale'',%L::jsonb)',a,oa,gen_random_uuid(),payload||jsonb_build_object('product_id',pb)),'FINANCE_RECORD_NOT_FOUND');
 perform pg_temp.stock_reject(format('select public.record_business_finance(%L,%L,%L,''sale'',%L::jsonb)',a,oa,gen_random_uuid(),payload||'{"quantity":14}'::jsonb),'FINANCE_STOCK_INSUFFICIENT');
 perform pg_temp.stock_assert((select inventory_quantity=13 from public.salon_products where id=pa),'failed sale does not alter inventory');
 -- Exercise the existing real reservation and release RPCs, including retries.
 update public.salon_products set product_status='Active',is_visible=true,pickup_enabled=true where id=pa;
 result:=public.reserve_combined_checkout(a,null,'Inventory guest','stock-guest@example.test','','Pickup',null,jsonb_build_array(jsonb_build_object('product_id',pa,'quantity',1)),null,null,0,'stock-reservation');
 perform pg_temp.stock_assert((select inventory_quantity=12 from public.salon_products where id=pa),'checkout reserves one unit');
 perform public.reserve_combined_checkout(a,null,'Inventory guest','stock-guest@example.test','','Pickup',null,jsonb_build_array(jsonb_build_object('product_id',pa,'quantity',1)),null,null,0,'stock-reservation');
 perform pg_temp.stock_assert((select inventory_quantity=12 from public.salon_products where id=pa),'checkout retry does not reserve twice');
 perform public.release_combined_checkout((result->>'commerce_intent_id')::uuid,'Cancelled');
 perform public.release_combined_checkout((result->>'commerce_intent_id')::uuid,'Cancelled');
 perform pg_temp.stock_assert((select inventory_quantity=13 from public.salon_products where id=pa),'system deduction/release not doubled');
 -- A file exported before these sales cannot put the old quantity back.
 perform public.import_salon_products_spreadsheet(a,oa,'old-stock.csv',jsonb_build_array(jsonb_build_object('record_id',pa,'name','Oil A','price',25,'inventory_quantity',99,'low_stock_threshold',3,'track_inventory',true,'product_status','Active','is_visible',true,'pickup_enabled',true,'pickup_prep_minutes',60,'shipping_enabled',false,'shipping_price',0,'tax_category','general_tangible_goods','max_quantity_per_order',10)));
 perform pg_temp.stock_assert((select inventory_quantity=13 from public.salon_products where id=pa),'stale import preserves actual stock');
 select stock_revision into rev from public.salon_products where id=pa;
 perform public.record_business_stock(a,oa,gen_random_uuid(),'correction',jsonb_build_object('product_id',pa,'expected_revision',rev,'quantity',0,'note','Physical stock count'));
 perform pg_temp.stock_assert((select inventory_quantity=0 from public.salon_products where id=pa),'zero correction retained');
 update public.salon_team_members set permissions='{}' where user_id=staff and salon_id=a;
 perform pg_temp.stock_reject(format('select public.read_business_stock(%L,%L)',a,staff),'STOCK_ACCESS_DENIED');
 perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claim.sub',oa::text,true);
 perform pg_temp.stock_reject(format('update public.salon_products set inventory_quantity=999 where id=%L',pa),'STOCK_USE_GUARDED_WORKFLOW');
 perform pg_temp.stock_assert(not has_table_privilege('authenticated','public.business_supplies','select') and not has_table_privilege('anon','public.business_stock_movements','select') and not has_function_privilege('authenticated','public.record_business_stock(uuid,uuid,uuid,text,jsonb)','execute'),'private grants and guarded functions');
end $$;
rollback;
