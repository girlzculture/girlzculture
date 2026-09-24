begin;
create temporary table upgrade_assertions(label text);
create function pg_temp.uassert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Solo upgrade: %',label;end if;insert into upgrade_assertions values(label);end $$;
do $$declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();sub uuid:=gen_random_uuid();old_address jsonb;begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)values(owner_a,'solo-upgrade-a@example.test','',now(),'{"role":"salon_owner"}'),(owner_b,'solo-upgrade-b@example.test','',now(),'{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_tier,subscription_status,operator_type,service_location_type,home_address_public,public_neighborhood)
 values(a,owner_a,'Solo upgrade fixture','solo-upgrade-a','solo-upgrade-a@example.test','Pending','Solo Pro','active','solo','home',false,'Invented neighborhood'),(b,owner_b,'Unrelated solo','solo-upgrade-b','solo-upgrade-b@example.test','Pending','Solo','active','solo','mobile',false,'Invented area');
 insert into public.subscriptions(id,salon_id,tier,status)values(sub,a,'Solo Pro','active');
 perform pg_temp.uassert(public.salon_is_solo(a),'Solo Pro starts with single calendar');
 perform pg_temp.uassert(not public.salon_has_feature(a,'unlimited_stylist_profiles'),'team unavailable before upgrade');
 update public.subscriptions set scheduled_tier='Starter' where id=sub;
 perform pg_temp.uassert((select operator_type='solo' from public.salons where id=a),'scheduled plan does not change operator');
 perform pg_temp.uassert((select count(*)=0 from public.business_operator_transitions where salon_id=a),'no premature audit');
 update public.subscriptions set tier='Starter',status='incomplete',scheduled_tier=null where id=sub;
 perform pg_temp.uassert((select operator_type='solo' from public.salons where id=a),'failed payment does not project team');
 -- This is a simulated provider-confirmed subscription row, not a real charge.
 update public.subscriptions set status='active' where id=sub;
 perform pg_temp.uassert((select operator_type='team' from public.salons where id=a),'confirmed active tier changes operator');
 perform pg_temp.uassert(not public.salon_is_solo(a),'additional calendars available immediately');
 perform pg_temp.uassert(public.salon_has_feature(a,'unlimited_stylist_profiles'),'team profiles available immediately');
 perform pg_temp.uassert(public.p0_actor_has_permission(a,owner_a,'stylists'),'owner team permission available immediately');
 perform pg_temp.uassert((select count(*)=1 from public.business_operator_transitions where salon_id=a and new_plan='Starter' and subscription_id=sub),'durable transition audit');
 update public.subscriptions set tier='Starter',status='active' where id=sub;
 perform pg_temp.uassert((select count(*)=1 from public.business_operator_transitions where salon_id=a),'webhook replay does not duplicate transition');
 perform pg_temp.uassert((select operator_type='solo' from public.salons where id=b),'other business unchanged');
 perform pg_temp.uassert((select service_location_type='home' and not home_address_public and address_street is null and public_neighborhood='Invented neighborhood' from public.salons where id=a),'upgrade never publishes private address');
 update public.subscriptions set tier='Solo',status='active' where id=sub;
 perform pg_temp.uassert(public.salon_is_solo(a) and not public.salon_has_feature(a,'unlimited_stylist_profiles'),'downgrade still enforces single calendar and no team access');
 perform pg_temp.uassert(not public.p0_actor_has_permission(a,owner_b,'stylists'),'foreign actor cannot gain team access');
 perform pg_temp.uassert(not has_table_privilege('authenticated','public.business_operator_transitions','INSERT'),'browser cannot forge transition audit');
 perform pg_temp.uassert(not has_table_privilege('anon','public.business_operator_transitions','SELECT'),'audit is not public');
end $$;
select count(*)||' Solo-to-team transition assertions passed (no provider calls)' from upgrade_assertions;
rollback;
