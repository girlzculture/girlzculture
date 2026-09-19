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
declare customer2 uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();ba uuid:=gen_random_uuid();bb uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();stylist uuid:=gen_random_uuid();booka uuid:=gen_random_uuid();booka2 uuid:=gen_random_uuid();bookb uuid:=gen_random_uuid();guest uuid:=gen_random_uuid();operation uuid:=gen_random_uuid();photo uuid:=gen_random_uuid();photo2 uuid:=gen_random_uuid();path text;result jsonb;again jsonb;card jsonb;exposed integer;patch jsonb:='{"preferences":"No excessive tightness","notes":"Private A only","cautions":"Original sensitivity A","formula":{"instructions":"Medium waist-length box braids","color":"4 / 27","size":"Medium","length":"Waist","technique":"Knotless","duration_minutes":240}}';
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

 perform public.save_business_client_card(ba,oa,booka,gen_random_uuid(),0,'en','{"notes":"Registered original","cautions":"Sensitivity A","formula":{"color":"4 / 27","duration_minutes":240}}');
 perform public.save_business_client_card(ba,oa,guest,gen_random_uuid(),0,'fr','{"notes":"Guest original","cautions":"Guest caution","formula":{"technique":"Knotless 240"}}');
 perform public.save_business_client_card(bb,ob,bookb,gen_random_uuid(),0,'en','{"notes":"Private B"}');
 card:=public.read_business_client_card(ba,oa,guest);
 perform pg_temp.client_assert(card->>'visit_count'='1' and card->>'notes'='Guest original','guest name/email alone never join history');
 perform pg_temp.client_assert(jsonb_array_length(public.read_business_client_links(ba,oa,guest,'Shared')->'candidates')=2,'search excludes other business');
 perform pg_temp.client_reject(format('select public.read_business_client_links(%L,%L,%L,%L)',ba,staff,guest,'Shared'),'CLIENT_ACCESS_DENIED');
 perform pg_temp.client_reject(format('select public.change_business_client_link(%L,%L,%L,%L,0,%L,%L)',ba,oa,guest,operation,'link',bookb),'CLIENT_NOT_FOUND');
 perform pg_temp.client_reject(format('select public.change_business_client_link(%L,%L,%L,%L,0,%L,%L)',ba,staff,guest,operation,'link',booka),'CLIENT_ACCESS_DENIED');
 result:=public.change_business_client_link(ba,oa,guest,operation,0,'link',booka);
 again:=public.change_business_client_link(ba,oa,guest,operation,0,'link',booka);
 perform pg_temp.client_assert(result=again and result->>'revision'='1','link retry commits once');
 perform pg_temp.client_assert((select count(*)=1 from public.business_client_link_events where salon_id=ba),'immutable action evidence once');
 card:=public.read_business_client_card(ba,oa,guest);
 perform pg_temp.client_assert(card->>'visit_count'='3' and card->>'notes'='Guest original' and card->'related_profiles'->0->>'notes'='Registered original','linked history preserves both source profiles');
 perform pg_temp.client_assert(card->'spend'->>'completed_agreed_cents'='30000' and position('Private B' in card::text)=0,'linked spend never double counts or crosses business');
 perform pg_temp.client_assert((select formula->>'color'='4 / 27' from jsonb_to_recordset(card->'visits') as v(booking_id uuid,formula jsonb) where booking_id=booka),'linked formula exact');
 perform pg_temp.client_assert((select customer_id is null from public.bookings where id=guest),'link does not claim guest Auth identity');
 card:=public.read_business_client_card(ba,staff,guest);
 perform pg_temp.client_assert(card->>'visit_count'='2' and card->'spend'='null'::jsonb and card->'related_profiles'->0->'cautions'='null'::jsonb,'staff assignment and field permissions before projection');
 perform pg_temp.client_assert(position(booka2::text in card::text)=0,'unassigned linked appointment omitted');
 path:=ba||'/'||booka||'/'||photo||'.webp';insert into storage.objects(bucket_id,name) values('business-client-work',path);
 perform public.record_business_client_photo(ba,oa,booka,photo,'Own work','en');
 perform pg_temp.client_assert(public.read_business_client_photo(ba,oa,guest,photo)=path,'linked private photo through fresh authorized guard');
 perform pg_temp.client_reject(format('select public.read_business_client_photo(%L,%L,%L,%L)',ba,staff,guest,photo),'CLIENT_ACCESS_DENIED');
 perform pg_temp.client_reject(format('select public.change_business_client_link(%L,%L,%L,%L,0,%L,%L)',ba,oa,guest,gen_random_uuid(),'unlink',result->>'link_id'),'CLIENT_CHANGED');
 -- Add another verified identity in the same business. The guest cannot bridge it.
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(customer2,'other-link@example.test','',now(),'{"role":"customer"}');
 insert into public.customers(id,name,email) values(customer2,'Other identity','other-link@example.test');
 insert into public.bookings(id,salon_id,style_id,customer_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,status) values(gen_random_uuid(),ba,sa,customer2,'Other identity',now()+interval '3 days',1,50,0,50,'Confirmed') returning id into booka2;
 perform pg_temp.client_reject(format('select public.change_business_client_link(%L,%L,%L,%L,1,%L,%L)',ba,oa,guest,gen_random_uuid(),'link',booka2),'CLIENT_IDENTITY_CONFLICT');
 perform public.change_business_client_link(ba,oa,guest,gen_random_uuid(),1,'unlink',(result->>'link_id')::uuid);
 card:=public.read_business_client_card(ba,oa,guest);
 perform pg_temp.client_assert(card->>'visit_count'='1' and card->'related_profiles'='[]'::jsonb and card->>'notes'='Guest original','unlink removes access without deleting original cards');
 perform pg_temp.client_reject(format('select public.read_business_client_photo(%L,%L,%L,%L)',ba,oa,guest,photo),'CLIENT_NOT_FOUND');
 perform pg_temp.client_assert(public.read_business_client_card(ba,oa,booka)->>'notes'='Registered original','target profile survives unlink');
 perform pg_temp.client_assert(not has_function_privilege('service_role','public.business_client_linked_subjects(uuid,text)','execute'),'internal graph helper not exposed to server bypass');
 perform pg_temp.client_assert(not has_function_privilege('authenticated','public.change_business_client_link(uuid,uuid,uuid,uuid,integer,text,uuid)','execute'),'browser cannot forge actor');
 perform pg_temp.client_assert(not has_table_privilege('service_role','public.business_client_visit_links','select'),'no raw server link read');
end $$;
rollback;
