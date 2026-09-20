-- Synthetic local database fixtures only. All records roll back.
begin;
create function pg_temp.client_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Client assertion failed: %',label; end if; end $$;
create function pg_temp.client_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false; begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then rejected:=true;else raise;end if;end;perform pg_temp.client_assert(rejected,expected);end $$;
-- Give fixture browser roles REST-like table reachability so the following
-- denial proves RLS, rather than only the minimal local bootstrap's grants.
grant usage on schema storage to anon,authenticated;
grant select on storage.objects to anon,authenticated;
grant select on public.styles,public.stylists,public.bookings to anon,authenticated;
do $$
declare oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();ba uuid:=gen_random_uuid();bb uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();stylist uuid:=gen_random_uuid();booka uuid:=gen_random_uuid();booka2 uuid:=gen_random_uuid();bookb uuid:=gen_random_uuid();guest uuid:=gen_random_uuid();operation uuid:=gen_random_uuid();photo uuid:=gen_random_uuid();photo2 uuid:=gen_random_uuid();path text;result jsonb;again jsonb;card jsonb;exposed integer;patch jsonb:='{"preferences":"No excessive tightness","notes":"Private A only","cautions":"Original sensitivity A","formula":{"instructions":"Medium waist-length box braids","color":"4 / 27","size":"Medium","length":"Waist","technique":"Knotless","duration_minutes":240}}';
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
  (oa,'client-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'client-owner-b@example.test','',now(),'{"role":"salon_owner"}'),
  (customer,'client-shared@example.test','',now(),'{"role":"customer"}'),(staff,'client-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.customers(id,name,email) values(customer,'Shared customer','client-shared@example.test');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier) values(ba,oa,'Client A','client-a','client-owner-a@example.test','Active','active','Premium'),(bb,ob,'Client B','client-b','client-owner-b@example.test','Active','active','Premium');
 insert into public.stylists(id,salon_id,name) values(stylist,ba,'Assigned stylist');
 insert into public.salon_team_members(salon_id,user_id,stylist_id,email,name,role,status,permissions) values(ba,staff,stylist,'client-staff@example.test','Assigned stylist','Stylist','Active','{"bookings":true,"client_history":true,"client_formulas":true,"client_notes":true,"client_edit":true}');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max)
 select fixture.style_id,fixture.business_id,g.id,fixture.name,1,1,100,100,100 from (values(sa,ba,'A service'),(sb,bb,'B service')) fixture(style_id,business_id,name)
 cross join lateral(select id from public.service_groups where is_active and archived_at is null order by sort_order,name limit 1) g;
 insert into public.bookings(id,salon_id,style_id,stylist_id,customer_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status) values
  (booka,ba,sa,stylist,customer,'Shared customer','client-shared@example.test',now()-interval '3 days',4,100,20,80,'Paid','Completed'),
  (booka2,ba,sa,null,customer,'Shared customer','client-shared@example.test',now()-interval '2 days',1,200,20,180,'Paid','Completed'),
  (bookb,bb,sb,null,customer,'Shared customer','client-shared@example.test',now()-interval '1 day',1,999,10,989,'Paid','Completed'),
  (guest,ba,sa,stylist,null,'Shared customer','client-shared@example.test',now()+interval '1 day',1,100,0,100,'No Payment Required','Confirmed');
 result:=public.save_business_client_card(ba,oa,booka,operation,0,'en',patch);
 again:=public.save_business_client_card(ba,oa,booka,operation,0,'en',patch);
 perform pg_temp.client_assert(result=again and (result->>'revision')::int=1,'idempotent save increments once');
 perform pg_temp.client_assert((select count(*)=1 from public.business_client_events where salon_id=ba),'one audit entry');
 perform public.save_business_client_card(bb,ob,bookb,gen_random_uuid(),0,'es','{"notes":"Private B never disclose","cautions":"Caution B"}');
 card:=public.read_business_client_card(ba,oa,booka);
 perform pg_temp.client_assert(card->>'notes'='Private A only' and card->>'cautions'='Original sensitivity A' and (card->>'visit_count')::int=2,'own fields and own customer bookings only');
 perform pg_temp.client_assert(position('Private B' in card::text)=0 and not exists(select 1 from jsonb_array_elements(card->'visits') v where v->>'booking_id'=bookb::text or v->>'agreed_amount'='999.00'),'shared customer does not cross businesses');
 perform pg_temp.client_assert(card->'spend'->>'completed_agreed_cents'='30000' and card->'spend'->>'recorded_payment_cents'='4000','sales and payments remain distinct');
 perform pg_temp.client_assert((select formula->>'instructions'='Medium waist-length box braids' from jsonb_to_recordset(card->'visits') as v(booking_id uuid,formula jsonb) where booking_id=booka),'formula exact original details preserved');
 perform pg_temp.client_assert(public.read_business_client_card(ba,oa,booka2)->>'card_id'=result->>'card_id','returning authenticated customer keeps own card');
 perform pg_temp.client_assert(public.read_business_client_card(ba,oa,guest)->>'card_id' is null,'same typed name/email does not falsely link guest identity');
 perform pg_temp.client_reject(format('select public.read_business_client_card(%L,%L,%L)',bb,oa,bookb),'CLIENT_ACCESS_DENIED');
 perform pg_temp.client_reject(format('select public.read_business_client_card(%L,%L,%L)',ba,oa,bookb),'CLIENT_NOT_FOUND');
 perform pg_temp.client_reject(format('select public.read_business_client_card(%L,%L,%L)',ba,staff,booka2),'CLIENT_NOT_FOUND');
 card:=public.read_business_client_card(ba,staff,booka);
 perform pg_temp.client_assert(card->'cautions'='null'::jsonb and card->'spend'='null'::jsonb and card->'photos'='[]'::jsonb and (card->>'visit_count')::int=1,'projection removes denied fields and unassigned visits before server/model');
 perform pg_temp.client_reject(format('select public.save_business_client_card(%L,%L,%L,%L,1,%L,%L::jsonb)',ba,staff,booka,gen_random_uuid(),'en','{"cautions":"Forbidden write"}'),'CLIENT_ACCESS_DENIED');
 perform pg_temp.client_reject(format('select public.save_business_client_card(%L,%L,%L,%L,0,%L,%L::jsonb)',ba,oa,booka,gen_random_uuid(),'en','{"notes":"Stale write"}'),'CLIENT_CHANGED');
 perform pg_temp.client_reject(format('select public.save_business_client_card(%L,%L,%L,%L,1,%L,%L::jsonb)',ba,oa,booka,gen_random_uuid(),'en','{"salon_id":"forged"}'),'CLIENT_INVALID');
 perform pg_temp.client_reject(format('select public.save_business_client_card(%L,%L,%L,%L,1,%L,%L::jsonb)',ba,oa,booka,gen_random_uuid(),'en','{"formula":{"duration_minutes":1.5}}'),'CLIENT_INVALID');
 perform pg_temp.client_assert(public.read_business_client_card(ba,oa,booka)->>'notes'='Private A only','rejected writes preserve saved fields');
 perform public.save_business_client_card(ba,staff,booka,gen_random_uuid(),1,'fr','{"notes":"Correction A"}');
 perform pg_temp.client_assert((select count(*)=2 from public.business_client_events where salon_id=ba),'correction history retained');
 path:=ba||'/'||booka||'/'||photo||'.webp';
 insert into storage.objects(bucket_id,name) values('business-client-work',path);
 perform public.record_business_client_photo(ba,oa,booka,photo,'Work A','en');
 perform public.record_business_client_photo(ba,oa,booka,photo,'Work A','en');
 perform pg_temp.client_assert(public.read_business_client_photo(ba,oa,booka,photo)=path,'guarded private photo path');
 perform pg_temp.client_reject(format('select public.read_business_client_photo(%L,%L,%L,%L)',ba,staff,booka,photo),'CLIENT_ACCESS_DENIED');
 perform pg_temp.client_reject(format('select public.read_business_client_photo(%L,%L,%L,%L)',bb,ob,bookb,photo),'CLIENT_NOT_FOUND');
 update public.salon_team_members set permissions=permissions||'{"client_photos":true}' where salon_id=ba and user_id=staff;
 perform pg_temp.client_assert(public.read_business_client_photo(ba,staff,booka,photo)=path,'explicit field permission grants own assigned photo');
 insert into storage.objects(bucket_id,name) values('business-client-work',ba||'/'||booka2||'/'||photo2||'.webp');
 perform public.record_business_client_photo(ba,oa,booka2,photo2,'Other assigned staff work','en');
 perform pg_temp.client_reject(format('select public.read_business_client_photo(%L,%L,%L,%L)',ba,staff,booka,photo2),'CLIENT_NOT_FOUND');
 perform pg_temp.client_assert(jsonb_array_length(public.read_business_client_card(ba,staff,booka)->'photos')=1,'photo history respects visit assignment');
 perform public.record_business_client_photo(ba,oa,booka,photo,'Work A','en',true);
 perform pg_temp.client_reject(format('select public.read_business_client_photo(%L,%L,%L,%L)',ba,oa,booka,photo),'CLIENT_NOT_FOUND');
 update public.salon_team_members set permissions='{"bookings":true}' where salon_id=ba and user_id=staff;
 perform pg_temp.client_reject(format('select public.read_business_client_card(%L,%L,%L)',ba,staff,booka),'CLIENT_ACCESS_DENIED');
 perform pg_temp.client_assert(not has_table_privilege('authenticated','public.business_client_cards','select') and not has_table_privilege('service_role','public.business_client_cards','select'),'raw card fields have no direct REST/server table path');
 perform pg_temp.client_assert(not has_function_privilege('authenticated','public.read_business_client_card(uuid,uuid,uuid)','execute'),'browser cannot forge actor RPC');
 perform pg_temp.client_assert((select not public from storage.buckets where id='business-client-work'),'client photos are private');
 perform pg_temp.client_assert(public.read_business_client_card(ba,oa,booka)->'field_locales'->>'cautions'='en' and public.read_business_client_card(ba,oa,booka)->'field_locales'->>'notes'='fr','changing notes does not relabel untouched original caution language');
 perform set_config('request.jwt.claim.sub',oa::text,true);
 execute 'set local role authenticated';
 select count(*) into exposed from storage.objects where bucket_id='business-client-work';
 execute 'reset role';
 perform pg_temp.client_assert(exposed=0,'even the owner cannot bypass private-photo authorization through Storage REST');
 execute 'set local role anon';
 select count(*) into exposed from storage.objects where bucket_id='business-client-work';
 execute 'reset role';
 perform pg_temp.client_assert(exposed=0,'public Storage policies do not expose private client photos');
end $$;
rollback;
