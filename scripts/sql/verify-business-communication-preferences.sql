begin;
create function pg_temp.comms_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Communication assertion failed: %',label;end if;end $$;
do $$
declare owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();stranger uuid:=gen_random_uuid();
 business_a uuid:=gen_random_uuid();business_b uuid:=gen_random_uuid();service_a uuid:=gen_random_uuid();service_b uuid:=gen_random_uuid();
 booking_a uuid:=gen_random_uuid();booking_b uuid:=gen_random_uuid();guest_booking uuid:=gen_random_uuid();guest_token uuid:=gen_random_uuid();
 request_id uuid:=gen_random_uuid();pref_id uuid;result jsonb;choices jsonb:='{"email_enabled":true,"sms_enabled":false,"push_enabled":true,"reminders":true,"follow_up":true,"marketing":true,"locale":"es","consent_version":1}';blocked boolean;claim uuid;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 (owner_a,'comms-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(owner_b,'comms-owner-b@example.test','',now(),'{"role":"salon_owner"}'),
 (customer,'comms-customer@example.test','',now(),'{"role":"customer"}'),(stranger,'comms-stranger@example.test','',now(),'{"role":"customer"}');
 insert into public.customers(id,name,email) values(customer,'Communication customer','comms-customer@example.test'),(stranger,'Other customer','comms-stranger@example.test');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier) values
 (business_a,owner_a,'Communication A','communication-a','comms-owner-a@example.test','Active','active','Premium'),
 (business_b,owner_b,'Communication B','communication-b','comms-owner-b@example.test','Active','active','Premium');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max)
 select service_a,business_a,id,'Service A',1,1,100,100,100 from public.service_groups where is_active and archived_at is null limit 1;
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max)
 select service_b,business_b,id,'Service B',1,1,100,100,100 from public.service_groups where is_active and archived_at is null limit 1;
 insert into public.bookings(id,salon_id,style_id,customer_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status) values
 (booking_a,business_a,service_a,customer,now()+interval '24 hours',1,100,10,90,'Paid','Confirmed'),
 (booking_b,business_b,service_b,customer,now()+interval '27 hours',1,100,10,90,'Paid','Confirmed'),
 (guest_booking,business_a,service_a,null,now()+interval '48 hours',1,100,10,90,'Paid','Confirmed');
 insert into public.booking_guest_access_tokens(id,booking_id,token_hash,purpose,expires_at) values(guest_token,guest_booking,'synthetic-communications-token','manage',now()+interval '1 day');
 result:=public.manage_business_communication_preferences(booking_a,customer,null);
 perform pg_temp.comms_assert(result->>'scope'='business' and result->>'revision'='0' and result->>'marketing'='false' and result->>'follow_up'='false','optional communications default off');
 perform pg_temp.comms_assert(not exists(select from public.business_communication_preferences),'reading preferences does not write consent');
 blocked:=false;begin perform public.manage_business_communication_preferences(booking_a,owner_a,null,choices,0,request_id);exception when others then if sqlerrm='COMMUNICATION_FORBIDDEN' then blocked:=true;else raise;end if;end;
 perform pg_temp.comms_assert(blocked,'business cannot opt customer in');
 blocked:=false;begin perform public.manage_business_communication_preferences(booking_a,stranger,null);exception when others then if sqlerrm='COMMUNICATION_FORBIDDEN' then blocked:=true;else raise;end if;end;
 perform pg_temp.comms_assert(blocked,'different customer cannot read');
 result:=public.manage_business_communication_preferences(booking_a,customer,null,choices,0,request_id);
 perform pg_temp.comms_assert(result->>'revision'='1' and result->>'locale'='es','customer saves their business-scoped choices');
 result:=public.manage_business_communication_preferences(booking_a,customer,null,choices,0,request_id);
 perform pg_temp.comms_assert(result->>'revision'='1' and (select count(*)=1 from public.business_communication_preference_history),'identical transport retry does not create duplicate consent');
 blocked:=false;begin perform public.manage_business_communication_preferences(booking_a,customer,null,choices,0,gen_random_uuid());exception when others then if sqlerrm='COMMUNICATION_STALE' then blocked:=true;else raise;end if;end;
 perform pg_temp.comms_assert(blocked,'stale cross-device revision rejected');
 blocked:=false;begin perform public.manage_business_communication_preferences(booking_a,customer,null,choices||'{"marketing":false}',1,request_id);exception when others then if sqlerrm='COMMUNICATION_REQUEST_REUSED' then blocked:=true;else raise;end if;end;
 perform pg_temp.comms_assert(blocked,'reused request cannot change consent');
 result:=public.manage_business_communication_preferences(booking_b,customer,null);
 perform pg_temp.comms_assert(result->>'marketing'='false' and result->>'revision'='0','same customer in another business has independent consent');
 perform pg_temp.comms_assert(public.claim_notification_delivery(booking_b,'business_campaign:10000000-0000-4000-8000-000000000001','customer','email','fixture@example.test',booking_b||':campaign') is null,'another business cannot reuse consent');
 perform pg_temp.comms_assert(public.claim_notification_delivery(booking_a,'booking_confirmed','customer','sms','000',booking_a||':sms') is null,'channel opt-out enforced at delivery reservation');
 perform pg_temp.comms_assert(public.claim_notification_delivery(booking_a,'business_campaign:10000000-0000-4000-8000-000000000001','customer','email','fixture@example.test',booking_a||':campaign') is not null,'opted-in campaign reserves its own booking channel');
 claim:=public.claim_notification_delivery(booking_a,'booking_confirmed','customer','email','fixture@example.test',booking_a||':email');
 perform pg_temp.comms_assert(claim is not null,'enabled essential confirmation still reserves once');
 perform pg_temp.comms_assert(public.claim_notification_delivery(booking_a,'booking_confirmed','customer','email','fixture@example.test',booking_a||':email') is null,'duplicate send cannot acquire same lease');
 perform pg_temp.comms_assert(public.claim_notification_delivery(booking_a,'booking_follow_up','customer','email','fixture@example.test',booking_a||':followup') is null,'upcoming booking never receives post-visit message');
 update public.bookings set status='Completed',appointment_datetime=now()-interval '4 hours' where id=booking_a;
 perform pg_temp.comms_assert(public.claim_notification_delivery(booking_a,'booking_follow_up','customer','email','fixture@example.test',booking_a||':followup') is not null,'opted-in completed visit can receive follow-up');
 select id into pref_id from public.business_communication_preferences where salon_id=business_a and customer_id=customer;
 perform public.unsubscribe_business_communications(pref_id,gen_random_uuid());
 perform public.unsubscribe_business_communications(pref_id,gen_random_uuid());
 result:=public.manage_business_communication_preferences(booking_a,customer,null,choices,0,request_id);
 perform pg_temp.comms_assert(result->>'revision'='2' and result->>'marketing'='false' and result->>'follow_up'='false','old save retry cannot undo unsubscribe');
 perform pg_temp.comms_assert((select count(*)=2 from public.business_communication_preference_history),'repeated opt-out does not duplicate history');
 perform pg_temp.comms_assert(public.claim_notification_delivery(booking_a,'business_campaign:10000000-0000-4000-8000-000000000002','customer','email','fixture@example.test',booking_a||':campaign-new') is null,'latest opt-out blocks next campaign');
 result:=public.manage_business_communication_preferences(guest_booking,null,guest_token,choices,0,gen_random_uuid());
 perform pg_temp.comms_assert(result->>'scope'='booking','guest capability preferences remain booking-only');
 blocked:=false;begin perform public.manage_business_communication_preferences(booking_a,null,guest_token);exception when others then if sqlerrm='COMMUNICATION_FORBIDDEN' then blocked:=true;else raise;end if;end;
 perform pg_temp.comms_assert(blocked,'guest cannot target another booking');
 update public.booking_guest_access_tokens set revoked_at=now() where id=guest_token;
 blocked:=false;begin perform public.manage_business_communication_preferences(guest_booking,null,guest_token);exception when others then if sqlerrm='COMMUNICATION_FORBIDDEN' then blocked:=true;else raise;end if;end;
 perform pg_temp.comms_assert(blocked,'revoked guest token cannot read saved preferences');
 perform pg_temp.comms_assert(not has_table_privilege('authenticated','public.business_communication_preferences','SELECT'),'private consent inaccessible through direct REST');
 perform pg_temp.comms_assert(not has_function_privilege('authenticated','public.manage_business_communication_preferences(uuid,uuid,uuid,jsonb,integer,uuid)','EXECUTE'),'caller cannot forge customer identity through direct RPC');
 perform pg_temp.comms_assert(not has_function_privilege('service_role','public.claim_notification_delivery_without_preferences(uuid,text,text,text,text,text)','EXECUTE'),'ordinary server send paths cannot bypass consent gate');
 raise notice 'PASS: two-business consent isolation, actor/guest boundaries, revision/idempotency, channel/status reservation and unsubscribe verified without sending messages.';
end $$;
rollback;
