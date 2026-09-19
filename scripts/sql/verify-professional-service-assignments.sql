begin;
create function pg_temp.assignment_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assignment assertion failed: %',label; end if;end $$;
create function pg_temp.assignment_reject(command text,expected text) returns void language plpgsql as $$
declare denied boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then denied:=true;else raise;end if;end;perform pg_temp.assignment_assert(denied,expected);end $$;
do $$
declare owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();intent uuid;reservation text;book uuid;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(owner_a,'assignment-a@example.test','',now(),'{"role":"salon_owner"}'),(owner_b,'assignment-b@example.test','',now(),'{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier) values(a,owner_a,'Assignment A','assignment-a','assignment-a@example.test','Active','active','Premium'),(b,owner_b,'Assignment B','assignment-b','assignment-b@example.test','Active','active','Premium');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max)
 select fixture.id,fixture.business,g.id,fixture.name,1,1,100,100,100 from(values(sa,a,'Own service'),(sb,b,'Foreign service'))fixture(id,business,name) cross join lateral(select id from public.service_groups limit 1)g;
 insert into public.stylists(id,salon_id,name,is_active,is_draft) values(pa,a,'Own professional',true,false),(pb,b,'Foreign professional',true,false);
 perform pg_temp.assignment_assert((select assigned_service_ids is null from public.stylists where id=pa),'existing roster defaults to all services');
 perform set_config('request.jwt.claim.role','service_role',true);
 perform pg_temp.assignment_reject(format('update public.stylists set assigned_service_ids=array[%L]::uuid[] where id=%L',sb,pa),'PROFESSIONAL_SERVICE_SCOPE_INVALID');
 update public.stylists set assigned_service_ids=array[sa,sa] where id=pa;
 perform pg_temp.assignment_assert((select assigned_service_ids=array[sa] from public.stylists where id=pa),'deduplicated own services persist');
 reservation:=format('select public.reserve_booking_checkout(%L,%L,%L,null,null,now()+interval ''5 days'',1,15,''{}''::jsonb,100,10)',a,sa,pa);
 execute reservation into intent;
 update public.stylists set assigned_service_ids='{}' where id=pa;
 -- Failed new reservations use another time, so only the assignment guard rejects them.
 perform pg_temp.assignment_reject(format('select public.reserve_booking_checkout(%L,%L,%L,null,null,now()+interval ''6 days'',1,15,''{}''::jsonb,100,10)',a,sa,pa),'PROFESSIONAL_SERVICE_UNAVAILABLE');
 perform pg_temp.assignment_reject(format('select public.reserve_booking_checkout(%L,%L,null,null,null,now()+interval ''7 days'',1,15,''{}''::jsonb,100,10)',a,sa),'PROFESSIONAL_SERVICE_UNAVAILABLE');
 perform pg_temp.assignment_reject(format('select public.reserve_booking_checkout(%L,%L,%L,null,null,now()+interval ''8 days'',1,15,''{}''::jsonb,100,10)',a,sa,pb),'PROFESSIONAL_SERVICE_UNAVAILABLE');
 perform pg_temp.assignment_reject(format('select public.reserve_booking_checkout(%L,%L,%L,null,null,now()+interval ''8 days'',1,15,''{}''::jsonb,100,10)',a,sb,pa),'PROFESSIONAL_SERVICE_UNAVAILABLE');
 -- Completion of the prior authorized hold must remain possible after edits.
 update public.booking_checkout_intents set status='Paid' where id=intent;
 insert into public.bookings(salon_id,style_id,stylist_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,origin_checkout_intent_id)
 values(a,sa,pa,'Assignment fixture',now()+interval '5 days',1,100,10,90,'Paid','Confirmed',intent) returning id into book;
 perform pg_temp.assignment_assert((select status='Confirmed' and stylist_id=pa and estimated_total=100 from public.bookings where id=book),'held terms complete without assignment rewrite');
 update public.stylists set assigned_service_ids=null where id=pa;
 execute format('select public.reserve_booking_checkout(%L,%L,%L,null,null,now()+interval ''6 days'',1,15,''{}''::jsonb,100,10)',a,sa,pa);
 perform pg_temp.assignment_assert((select count(*)=2 from public.booking_checkout_intents where salon_id=a),'failed attempts leave no reservations; restored all-service choice works');
 perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claim.sub',owner_a::text,true);
 update public.stylists set assigned_service_ids=array[sa] where id=pa;
 perform pg_temp.assignment_reject(format('update public.stylists set assigned_service_ids=''{}'' where id=%L',pb),'PROFESSIONAL_ASSIGNMENT_FORBIDDEN');
 perform pg_temp.assignment_assert((select assigned_service_ids is null from public.stylists where id=pb),'foreign business remains unchanged');
end $$;
rollback;
