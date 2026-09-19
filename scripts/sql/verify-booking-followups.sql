begin;
create function pg_temp.followup_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Follow-up assertion failed: %',label;end if;end $$;
do $$
declare owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();
 business_a uuid:=gen_random_uuid();business_b uuid:=gen_random_uuid();service_a uuid:=gen_random_uuid();service_b uuid:=gen_random_uuid();
 booking_a uuid:=gen_random_uuid();booking_b uuid:=gen_random_uuid();lease uuid;replacement uuid;delivery uuid;
 choices jsonb:='{"email_enabled":true,"sms_enabled":false,"push_enabled":false,"reminders":true,"follow_up":true,"marketing":false,"locale":"es","consent_version":1}';
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 (owner_a,'followup-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(owner_b,'followup-owner-b@example.test','',now(),'{"role":"salon_owner"}'),
 (customer,'followup-customer@example.test','',now(),'{"role":"customer"}');
 insert into public.customers(id,name,email) values(customer,'Follow-up customer','followup-customer@example.test');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier) values
 (business_a,owner_a,'Follow-up A','followup-a','followup-owner-a@example.test','Active','active','Premium'),
 (business_b,owner_b,'Follow-up B','followup-b','followup-owner-b@example.test','Active','active','Premium');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max)
 select service_a,business_a,id,'Service A',1,1,100,100,100 from public.service_groups where is_active and archived_at is null limit 1;
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max)
 select service_b,business_b,id,'Service B',1,1,100,100,100 from public.service_groups where is_active and archived_at is null limit 1;
 insert into public.bookings(id,salon_id,style_id,customer_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status) values
 (booking_a,business_a,service_a,customer,now()-interval '26 hours',1,100,10,90,'Paid','Confirmed'),
 (booking_b,business_b,service_b,customer,now()-interval '30 hours',1,100,10,90,'Paid','Confirmed');
 perform pg_temp.followup_assert(not exists(select from public.booking_followup_queue where booking_id in(booking_a,booking_b)),'uncompleted visits never queue');
 update public.bookings set status='Completed' where id in(booking_a,booking_b);
 perform pg_temp.followup_assert((select count(*)=2 from public.booking_followup_queue where booking_id in(booking_a,booking_b)),'new completions queue once');
 perform pg_temp.followup_assert(not exists(select from public.claim_due_booking_followups(10)),'no optional follow-up without consent');
 perform public.manage_business_communication_preferences(booking_a,customer,null,choices,0,gen_random_uuid());
 set local role service_role;
 select lease_id into lease from public.claim_due_booking_followups(10) where booking_id=booking_a;
 reset role;
 perform pg_temp.followup_assert(lease is not null,'own-business consent makes completed visit due');
 perform pg_temp.followup_assert((select attempts=0 from public.booking_followup_queue where booking_id=booking_b),'consent cannot cross businesses for same customer');
 perform pg_temp.followup_assert(not exists(select from public.claim_due_booking_followups(10)),'concurrent scheduler cannot obtain active lease');
 perform pg_temp.followup_assert(public.claim_followup_notification_delivery(booking_a,'booking_follow_up','customer','sms','000','followup-sms',lease) is null,'disabled customer channel cannot send');
 perform pg_temp.followup_assert(public.claim_followup_notification_delivery(booking_a,'booking_follow_up','customer','email','fixture@example.test','followup-email',gen_random_uuid()) is null,'wrong lease cannot send');
 perform pg_temp.followup_assert(not public.finish_booking_followup(booking_a,gen_random_uuid(),true),'wrong worker cannot complete');
 -- Cancellation after queue selection is rejected again at channel reservation.
 update public.bookings set status='Cancelled' where id=booking_a;
 perform pg_temp.followup_assert(public.claim_followup_notification_delivery(booking_a,'booking_follow_up','customer','email','fixture@example.test','followup-email',lease) is null,'cancelled after selection cannot send');
 update public.bookings set status='Completed' where id=booking_a;
 select lease_id into replacement from public.claim_due_booking_followups(10) where booking_id=booking_a;
 perform pg_temp.followup_assert(replacement is not null and replacement<>lease,'corrected completion invalidates previous lease');
 perform pg_temp.followup_assert(not public.finish_booking_followup(booking_a,lease,true),'old worker cannot complete new attempt');
 -- Opt-out after selection is also checked immediately before dispatch.
 perform public.manage_business_communication_preferences(booking_a,customer,null,choices||'{"follow_up":false}',1,gen_random_uuid());
 perform pg_temp.followup_assert(public.claim_followup_notification_delivery(booking_a,'booking_follow_up','customer','email','fixture@example.test','followup-email',replacement) is null,'latest consent wins over queued snapshot');
 perform public.manage_business_communication_preferences(booking_a,customer,null,choices,2,gen_random_uuid());
 delivery:=public.claim_followup_notification_delivery(booking_a,'booking_follow_up','customer','email','fixture@example.test','followup-email',replacement);
 perform pg_temp.followup_assert(delivery is not null,'current consent and active lease allow one reservation');
 update public.notification_delivery_log set delivery_status='delivered' where id=delivery;
 perform pg_temp.followup_assert(public.claim_followup_notification_delivery(booking_a,'booking_follow_up','customer','email','fixture@example.test','followup-email',replacement) is null,'already delivered channel does not resend');
 perform pg_temp.followup_assert(public.finish_booking_followup(booking_a,replacement,true),'current worker records completion');
 update public.bookings set appointment_datetime=appointment_datetime+interval '1 hour' where id=booking_a;
 perform pg_temp.followup_assert(not exists(select from public.claim_due_booking_followups(10)),'completed queue never sends a second follow-up after schedule edit');
 -- A stale visit is not backfilled when marked completed later.
 update public.bookings set status='Confirmed',appointment_datetime=now()-interval '7 days' where id=booking_b;
 delete from public.booking_followup_queue where booking_id=booking_b;
 update public.bookings set status='Completed' where id=booking_b;
 perform pg_temp.followup_assert(not exists(select from public.booking_followup_queue where booking_id=booking_b),'old visits are not enqueued');
 -- A new due visit cannot exceed its delivery expiry or retry budget.
 update public.bookings set status='Confirmed',appointment_datetime=now()-interval '29 hours' where id=booking_b;
 update public.bookings set status='Completed' where id=booking_b;
 perform public.manage_business_communication_preferences(booking_b,customer,null,choices,0,gen_random_uuid());
 update public.booking_followup_queue set due_at=now()-interval '3 hours',expires_at=now()-interval '1 hour' where booking_id=booking_b;
 perform pg_temp.followup_assert(not exists(select from public.claim_due_booking_followups(10)),'expired queued message is never dispatched');
 update public.booking_followup_queue set expires_at=now()+interval '1 day',attempts=3 where booking_id=booking_b;
 perform pg_temp.followup_assert(not exists(select from public.claim_due_booking_followups(10)),'attempt limit is enforced before batch selection');
 update public.booking_followup_queue set attempts=0 where booking_id=booking_b;
 select lease_id into lease from public.claim_due_booking_followups(10) where booking_id=booking_b;
 perform pg_temp.followup_assert(lease is not null,'new due visit can be claimed');
 update public.bookings set appointment_datetime=appointment_datetime+interval '1 hour' where id=booking_b;
 perform pg_temp.followup_assert(public.claim_followup_notification_delivery(booking_b,'booking_follow_up','customer','email','fixture@example.test','followup-b',lease) is null,'rescheduling invalidates a previously selected lease');
 perform pg_temp.followup_assert(not has_table_privilege('authenticated','public.booking_followup_queue','SELECT'),'queue cannot be read through authenticated REST');
 perform pg_temp.followup_assert(not has_function_privilege('authenticated','public.claim_due_booking_followups(integer)','EXECUTE'),'only protected service worker can claim');
 perform pg_temp.followup_assert(not has_function_privilege('anon','public.finish_booking_followup(uuid,uuid,boolean,uuid)','EXECUTE'),'public cannot fake completion');
 raise notice 'PASS: completed-only, two-business consent, duplicate/lease protection, cancellation, opt-out, expiry and service-only access; no messages sent.';
end $$;
rollback;
