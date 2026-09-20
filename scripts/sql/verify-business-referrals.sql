-- Run only in a disposable local schema. All synthetic records roll back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.referral_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Referral assertion: %',label; end if; end $$;
create function pg_temp.referral_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false; begin begin execute command; exception when others then if position(expected in sqlerrm)>0 then rejected:=true; else raise; end if; end; perform pg_temp.referral_assert(rejected,expected); end $$;
create function pg_temp.referral_observe_proofs() returns void language sql as $$
 insert into public.business_referral_payment_checks(billing_event_id,state,proof)
 select id,'verified',metadata->'referral_payment' from public.billing_events where metadata->'referral_payment'->>'livemode'='true'
 on conflict(billing_event_id) do nothing;
$$;
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
 ('17600000-0000-4000-8000-000000000001','referral-owner-a@example.invalid','{"role":"salon_owner"}','{}'),
 ('17600000-0000-4000-8000-000000000002','referral-owner-b@example.invalid','{"role":"salon_owner"}','{}'),
 ('17600000-0000-4000-8000-000000000003','referral-owner-c@example.invalid','{"role":"salon_owner"}','{}'),
 ('17600000-0000-4000-8000-000000000004','referral-admin@example.invalid','{}','{}');
update public.platform_identities set primary_role='admin',status='Active' where user_id='17600000-0000-4000-8000-000000000004';
insert into public.admin_users(id,user_id,email,status,is_super_admin) values('17600000-0000-4000-8000-000000000004','17600000-0000-4000-8000-000000000004','referral-admin@example.invalid','Active',true);
insert into public.salons(id,name,slug,email,user_id,status,subscription_tier) values
 ('17600000-0000-4000-8000-000000000011','Referral A','referral-a','referral-owner-a@example.invalid','17600000-0000-4000-8000-000000000001','New','Free-seed'),
 ('17600000-0000-4000-8000-000000000012','Referral B','referral-b','referral-owner-b@example.invalid','17600000-0000-4000-8000-000000000002','New','Free-seed'),
 ('17600000-0000-4000-8000-000000000013','Referral C','referral-c','referral-owner-c@example.invalid','17600000-0000-4000-8000-000000000003','New','Free-seed');
set local role service_role;
do $$
declare a uuid:='17600000-0000-4000-8000-000000000011'; b uuid:='17600000-0000-4000-8000-000000000012'; c uuid:='17600000-0000-4000-8000-000000000013';
 oa uuid:='17600000-0000-4000-8000-000000000001'; ob uuid:='17600000-0000-4000-8000-000000000002'; oc uuid:='17600000-0000-4000-8000-000000000003'; adm uuid:='17600000-0000-4000-8000-000000000004';
 campaign uuid:=gen_random_uuid(); result jsonb; terms jsonb; code text; claim uuid; old_events integer;
begin
 perform pg_temp.referral_assert(not exists(select 1 from public.business_referral_campaigns where status='active'),'no active seed');
 terms:=jsonb_build_object('currency','usd','amount_cents',null,'recipient',null,'starts_at',null,'ends_at',null,'minimum_payment_cents',null,'qualifying_days',null,'hold_days',null,'max_rewards_per_referrer',null);
 result:=public.save_business_referral_campaign(adm,campaign,0,'Synthetic campaign',terms);
 perform pg_temp.referral_assert(result->>'status'='inactive','draft save stays inactive');
 perform pg_temp.referral_reject(format('select public.save_business_referral_campaign(%L,%L,1,''Hijack'',%L)',oa,campaign,terms),'REFERRAL_FORBIDDEN');
 perform pg_temp.referral_reject(format('select public.authorize_business_referral_campaign(%L,%L,1,true)',adm,campaign),'REFERRAL_REVIEW_REQUIRED');
 perform pg_temp.referral_reject(format('select public.create_business_referral_code(%L,%L,%L)',a,oa,campaign),'REFERRAL_CODE_UNAVAILABLE');
 terms:=jsonb_build_object('currency','usd','amount_cents',700,'recipient','referrer','starts_at',now()-interval '1 day','ends_at',now()+interval '90 days','minimum_payment_cents',8900,'qualifying_days',30,'hold_days',14,'max_rewards_per_referrer',1);
 result:=public.save_business_referral_campaign(adm,campaign,1,'Synthetic campaign',terms);
 perform pg_temp.referral_reject(format('select public.save_business_referral_campaign(%L,%L,1,''Stale'',%L)',adm,campaign,terms),'REFERRAL_CHANGED');
 perform public.authorize_business_referral_campaign(adm,campaign,2,true);
 code:=public.create_business_referral_code(a,oa,campaign)->>'code';
 perform pg_temp.referral_assert(public.create_business_referral_code(a,oa,campaign)->>'code'=code,'code resume');
 perform pg_temp.referral_reject(format('select public.create_business_referral_code(%L,%L,%L)',a,ob,campaign),'REFERRAL_FORBIDDEN');
 perform pg_temp.referral_reject(format('select public.claim_business_referral(%L,%L,%L)',a,oa,code),'REFERRAL_CODE_UNAVAILABLE');
 claim:=(public.claim_business_referral(b,ob,code)->>'id')::uuid;
 perform pg_temp.referral_assert((public.claim_business_referral(b,ob,code)->>'id')::uuid=claim,'claim replay');
 perform public.claim_business_referral(c,oc,code);
 perform pg_temp.referral_reject(format('select public.business_referral_workspace(%L,%L)',a,ob),'REFERRAL_FORBIDDEN');
 -- Canonical proof and subscription fixtures; never a provider call.
 execute 'reset role';
 insert into public.subscriptions(salon_id,tier,status,stripe_customer_id,stripe_subscription_id) values(a,'Premium','active','cus_ReferralA','sub_ReferralA'),(b,'Starter','active','cus_ReferralB','sub_ReferralB'),(c,'Starter','active','cus_ReferralC','sub_ReferralC');
 insert into public.billing_events(salon_id,event_date,event_type,amount_collected,currency,payment_status,stripe_subscription_id,stripe_invoice_id,stripe_event_id,metadata)
 values(b,now(),'New subscription',8900,'usd','paid','sub_ReferralB','in_ReferralB','evt_ReferralUnverified','{}');
 execute 'set local role service_role';
 perform public.reconcile_business_referrals(a,oa);
 perform pg_temp.referral_assert(not exists(select 1 from public.business_referral_rewards),'paid label alone never qualifies');
 execute 'reset role';
 insert into public.billing_events(salon_id,event_date,event_type,amount_collected,currency,payment_status,stripe_subscription_id,stripe_invoice_id,stripe_event_id,metadata)
 values(b,now(),'New subscription',8900,'usd','paid','sub_ReferralB','in_ReferralB','evt_ReferralVerified',jsonb_build_object('referral_payment',jsonb_build_object('source','stripe_verified_payment_v1','livemode',true,'customer_id','cus_ReferralB','amount_cents',8900,'subscription_created_at',now(),'paid_at',now(),'charge_id','ch_ReferralB','payment_intent_id','pi_ReferralB')));
 execute 'set local role service_role';
 perform pg_temp.referral_observe_proofs();
 perform public.reconcile_business_referrals(a,oa);
 result:=public.business_referral_workspace(a,oa);
 perform pg_temp.referral_assert(jsonb_array_length(result->'rewards')=1 and result->'rewards'->0->>'status'='pending_review' and result->'rewards'->0->>'amount_cents'='700' and result->>'issuance_enabled'='false','own truthful entitlement');
 perform pg_temp.referral_assert(result::text not like '%Referral B%' and result::text not like '%cus_%' and result::text not like '%stripe_%' and result::text not like '%'||b::text||'%','no other business identity/payment in owner projection');
 perform pg_temp.referral_assert(jsonb_array_length(public.business_referral_workspace(b,ob)->'rewards')=0,'recipient enforced');
 select count(*) into old_events from public.business_referral_events;
 perform public.reconcile_business_referrals(a,oa);
 perform pg_temp.referral_assert((select count(*) from public.business_referral_rewards)=1 and (select count(*) from public.business_referral_events)=old_events,'qualification replay no duplicate reward/audit');
 -- Later edits pause the campaign but cannot rewrite captured agreement terms.
 terms:=jsonb_set(terms,'{amount_cents}','1000');
 result:=public.save_business_referral_campaign(adm,campaign,2,'Changed draft',terms);
 perform pg_temp.referral_assert(result->>'status'='inactive' and (select x.terms->>'amount_cents' from public.business_referral_claims x where x.id=claim)='700','immutable accepted terms');
 execute 'reset role';
 insert into public.billing_events(salon_id,event_date,event_type,amount_collected,currency,payment_status,stripe_subscription_id,stripe_invoice_id,stripe_event_id,metadata)
 values(c,now(),'New subscription',8900,'usd','paid','sub_ReferralC','in_ReferralC','evt_ReferralCap',jsonb_build_object('referral_payment',jsonb_build_object('source','stripe_verified_payment_v1','livemode',true,'customer_id','cus_ReferralC','amount_cents',8900,'subscription_created_at',now(),'paid_at',now(),'charge_id','ch_ReferralC','payment_intent_id','pi_ReferralC')));
 execute 'set local role service_role';
 perform pg_temp.referral_observe_proofs();
 perform public.reconcile_business_referrals(a,oa);
 perform pg_temp.referral_assert((select status from public.business_referral_claims where referred_salon_id=c)='on_hold','campaign cap');
 -- Refund evidence in the same canonical invoice ledger blocks an entitlement.
 execute 'reset role';
 insert into public.billing_events(salon_id,event_date,event_type,amount_refunded,currency,payment_status,stripe_subscription_id,stripe_invoice_id,stripe_event_id) values(b,now(),'Refund',100,'usd','succeeded','sub_ReferralB','in_ReferralB','evt_ReferralRefund');
 execute 'set local role service_role';
 perform public.reconcile_business_referrals(a,oa);
 perform pg_temp.referral_assert((select status from public.business_referral_rewards where claim_id=claim)='on_hold','refund holds reward');
 raise notice 'Referral real-role campaign, code, claim, proof, isolation, replay, cap, immutable terms and refund assertions passed';
end $$;
reset role;
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
 ('17600000-0000-4000-8000-000000000005','referral-owner-d@example.invalid','{"role":"salon_owner"}','{}'),
 ('17600000-0000-4000-8000-000000000006','referral-owner-e@example.invalid','{"role":"salon_owner"}','{}');
insert into public.salons(id,name,slug,email,user_id,status,subscription_tier) values
 ('17600000-0000-4000-8000-000000000015','Referral D','referral-d','referral-owner-d@example.invalid','17600000-0000-4000-8000-000000000005','New','Free-seed'),
 ('17600000-0000-4000-8000-000000000016','Referral E','referral-e','referral-owner-e@example.invalid','17600000-0000-4000-8000-000000000006','New','Free-seed');
set local role service_role;
do $$
declare a uuid:='17600000-0000-4000-8000-000000000011'; d uuid:='17600000-0000-4000-8000-000000000015'; e uuid:='17600000-0000-4000-8000-000000000016';
 oa uuid:='17600000-0000-4000-8000-000000000001'; od uuid:='17600000-0000-4000-8000-000000000005'; oe uuid:='17600000-0000-4000-8000-000000000006'; adm uuid:='17600000-0000-4000-8000-000000000004';
 campaign uuid:=gen_random_uuid(); terms jsonb; code text; claim uuid; result jsonb;
begin
 terms:=jsonb_build_object('currency','usd','amount_cents',500,'recipient','referred','starts_at',now()-interval '1 day','ends_at',now()+interval '90 days','minimum_payment_cents',8900,'qualifying_days',30,'hold_days',14,'max_rewards_per_referrer',10);
 perform public.save_business_referral_campaign(adm,campaign,0,'Referred-recipient fixture',terms);
 perform public.authorize_business_referral_campaign(adm,campaign,1,true);
 code:=public.create_business_referral_code(a,oa,campaign)->>'code';
 claim:=(public.claim_business_referral(d,od,code)->>'id')::uuid;
 perform public.claim_business_referral(e,oe,code);
 perform pg_temp.referral_reject(format('select public.claim_business_referral(%L,%L,%L)','17600000-0000-4000-8000-000000000012','17600000-0000-4000-8000-000000000002',code),'REFERRAL_ALREADY_RECORDED');
 execute 'reset role';
 insert into public.subscriptions(salon_id,tier,status,stripe_customer_id,stripe_subscription_id) values(d,'Starter','active','cus_ReferralA','sub_ReferralD');
 execute 'set local role service_role';
 perform public.reconcile_business_referrals(d,od);
 perform pg_temp.referral_assert((select review_reason from public.business_referral_claims where id=claim)='identity_review','shared provider customer holds claim');
 execute 'reset role';
 update public.subscriptions set stripe_customer_id='cus_ReferralD' where salon_id=d;
 insert into public.billing_events(salon_id,event_date,event_type,amount_collected,currency,payment_status,stripe_subscription_id,stripe_invoice_id,stripe_event_id,metadata)
 values(d,now(),'New subscription',8900,'usd','paid','sub_ReferralD','in_ReferralD','evt_ReferralTestMode',jsonb_build_object('referral_payment',jsonb_build_object('source','stripe_verified_payment_v1','livemode',false,'customer_id','cus_ReferralD','amount_cents',8900,'subscription_created_at',now(),'paid_at',now())));
 execute 'set local role service_role';
 perform public.reconcile_business_referrals(d,od);
 perform pg_temp.referral_assert(not exists(select 1 from public.business_referral_rewards where claim_id=claim),'test payment never qualifies');
 execute 'reset role';
 insert into public.billing_events(salon_id,event_date,event_type,amount_collected,currency,payment_status,stripe_subscription_id,stripe_invoice_id,stripe_event_id,metadata)
 values(d,now(),'New subscription',8900,'usd','paid','sub_ReferralD','in_ReferralD','evt_ReferralEarlierActivation',jsonb_build_object('referral_payment',jsonb_build_object('source','stripe_verified_payment_v1','livemode',true,'customer_id','cus_ReferralD','amount_cents',8900,'subscription_created_at',now()-interval '1 day','paid_at',now(),'charge_id','ch_ReferralD','payment_intent_id','pi_ReferralD')));
 execute 'set local role service_role';
 perform pg_temp.referral_observe_proofs();
 perform public.reconcile_business_referrals(d,od);
 perform pg_temp.referral_assert(not exists(select 1 from public.business_referral_rewards where claim_id=claim),'pre-referral activation never qualifies');
 execute 'reset role';
 insert into public.billing_events(salon_id,event_date,event_type,amount_collected,currency,payment_status,stripe_subscription_id,stripe_invoice_id,stripe_event_id,metadata)
 values(d,now(),'New subscription',8900,'usd','paid','sub_ReferralD','in_ReferralD','evt_ReferralRecipient',jsonb_build_object('referral_payment',jsonb_build_object('source','stripe_verified_payment_v1','livemode',true,'customer_id','cus_ReferralD','amount_cents',8900,'subscription_created_at',now(),'paid_at',now(),'charge_id','ch_ReferralD','payment_intent_id','pi_ReferralD')));
 update public.business_referral_claims x set created_at=now()-interval '2 days',terms=jsonb_set(x.terms,'{ends_at}',to_jsonb(now()-interval '1 day')) where x.referred_salon_id=e;
 execute 'set local role service_role';
 perform pg_temp.referral_observe_proofs();
 perform public.reconcile_business_referrals(d,od);
 result:=public.business_referral_workspace(d,od);
 perform pg_temp.referral_assert(jsonb_array_length(result->'rewards')=1 and result->'rewards'->0->>'amount_cents'='500','referred recipient receives own entitlement');
 perform public.reconcile_business_referrals(e,oe);
 perform pg_temp.referral_assert((select status from public.business_referral_claims where referred_salon_id=e)='expired','expired qualification window');
 update public.business_referral_payment_checks set state='unverified',proof=null,last_error='REFERRAL_PAYMENT_REVIEW' where billing_event_id=(select id from public.billing_events where stripe_event_id='evt_ReferralRecipient');
 perform pg_temp.referral_assert(public.business_referral_workspace(d,od)->'rewards'->0->>'status'='on_hold','failed fresh proof hides old positive immediately');
 perform public.reconcile_business_referrals(d,od);
 perform pg_temp.referral_assert((select status from public.business_referral_rewards where claim_id=claim)='on_hold','failed or disputed readback holds prior entitlement');
 execute 'reset role';
 insert into public.billing_events(salon_id,event_date,event_type,amount_collected,currency,payment_status,stripe_subscription_id,stripe_invoice_id,stripe_event_id,metadata)
 values(d,now()+interval '1 second','Renewal payment',8900,'usd','paid','sub_ReferralD','in_ReferralLater','evt_ReferralLaterPayment',jsonb_build_object('referral_payment',jsonb_build_object('source','stripe_verified_payment_v1','livemode',true,'customer_id','cus_ReferralD','amount_cents',8900,'subscription_created_at',now(),'paid_at',now(),'charge_id','ch_ReferralLater','payment_intent_id','pi_ReferralLater')));
 execute 'set local role service_role';
 perform pg_temp.referral_observe_proofs();
 perform public.reconcile_business_referrals(d,od);
 perform pg_temp.referral_assert((select status from public.business_referral_claims where id=claim)='on_hold' and (select qualifying_payment_intent_id from public.business_referral_rewards where claim_id=claim)='pi_ReferralD','later invoice cannot relabel original disputed/reversed entitlement');
 raise notice 'Referral duplicate attribution, shared customer, live-mode, activation timing, alternate recipient and expiry assertions passed';
end $$;
reset role;
-- Database clients cannot bypass the owner route or mutate entitlements.
select pg_temp.referral_assert(not has_table_privilege('anon','public.business_referral_rewards','select') and not has_table_privilege('authenticated','public.business_referral_rewards','select'),'private reward grants');
select pg_temp.referral_assert(not has_function_privilege('authenticated','public.business_referral_workspace(uuid,uuid)','execute'),'private workspace RPC');
select pg_temp.referral_assert(not exists(select 1 from pg_proc where proname in('claim_business_referral','reconcile_business_referrals','save_business_referral_campaign') and prosecdef),'invoker functions');
rollback;
