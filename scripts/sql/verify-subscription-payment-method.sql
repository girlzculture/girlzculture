-- Disposable local database only; synthetic rows and every assertion roll back.
begin;
create function pg_temp.method_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Payment method assertion failed: %',label; end if; end $$;
create function pg_temp.method_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin begin execute command; exception when others then if position(expected in sqlerrm)>0 then rejected:=true; else raise; end if; end;
perform pg_temp.method_assert(rejected,expected); end $$;
do $$
declare business_id uuid:=gen_random_uuid(); actor_id uuid:=gen_random_uuid(); replacement_owner_id uuid:=gen_random_uuid(); first_attempt jsonb; again jsonb; second_attempt jsonb;
  actor_email text:='method-fixture-'||actor_id||'@example.test'; replacement_owner_email text:='method-fixture-'||replacement_owner_id||'@example.test';
  first_id uuid; second_id uuid; lease_one uuid:=gen_random_uuid(); lease_two uuid:=gen_random_uuid(); result jsonb; before_subscription jsonb; first_apply text;
begin
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)
    values(actor_id,actor_email,'',now(),'{"role":"salon_owner"}'),
      (replacement_owner_id,replacement_owner_email,'',now(),'{"role":"salon_owner"}');
  insert into public.salons(id,user_id,email,name,slug,status) values(business_id,actor_id,actor_email,'Payment method local fixture','payment-method-fixture-'||business_id,'Pending');
  insert into public.subscriptions(salon_id,tier,status,stripe_customer_id,stripe_subscription_id)
    values(business_id,'Premium','active','cus_method_fixture','sub_method_fixture');
  select to_jsonb(s) into before_subscription from public.subscriptions s where salon_id=business_id;
  perform pg_temp.method_assert((select relrowsecurity from pg_class where oid='public.subscription_payment_method_attempts'::regclass),'RLS enabled');
  perform pg_temp.method_assert(not has_table_privilege('authenticated','public.subscription_payment_method_attempts','select'),'browser cannot read attempts');
  perform pg_temp.method_assert(not has_table_privilege('anon','public.subscription_payment_method_attempts','insert'),'anonymous cannot reserve attempts');
  perform pg_temp.method_assert(not has_function_privilege('authenticated','public.reserve_subscription_payment_method_attempt(uuid,uuid,text,text,boolean,text)','execute'),'browser cannot forge actor');
  perform pg_temp.method_assert(not has_function_privilege('authenticated','public.mark_subscription_payment_method_apply(uuid,uuid,text,text)','execute'),'browser cannot move apply clock');
  perform pg_temp.method_assert(not has_function_privilege('anon','public.finish_subscription_payment_method_attempt(uuid,uuid,text,text,text,text)','execute'),'anonymous cannot finish');
  perform pg_temp.method_assert(has_function_privilege('service_role','public.claim_subscription_payment_method_attempt(uuid,text,uuid)','execute'),'server can claim');
  perform pg_temp.method_assert(not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in
    ('reserve_subscription_payment_method_attempt','bind_subscription_payment_method_attempt','claim_subscription_payment_method_attempt','mark_subscription_payment_method_apply','finish_subscription_payment_method_attempt') and prosecdef),'all method RPCs use invoker privileges');
  -- Exercise the real server role's grants, not the migration owner's powers.
  set local role service_role;
  perform pg_temp.method_reject(format('select public.reserve_subscription_payment_method_attempt(%L,%L,%L,%L,false)',business_id,gen_random_uuid(),'cus_method_fixture','sub_method_fixture'),'PAYMENT_METHOD_OWNER_IDENTITY_CONFLICT');
  perform pg_temp.method_reject(format('select public.reserve_subscription_payment_method_attempt(%L,%L,%L,%L,false)',business_id,actor_id,'cus_other','sub_method_fixture'),'PAYMENT_METHOD_SUBSCRIPTION_IDENTITY_CONFLICT');
  first_attempt:=public.reserve_subscription_payment_method_attempt(business_id,actor_id,'cus_method_fixture','sub_method_fixture',false,'pm_baseline');
  first_id:=(first_attempt->>'id')::uuid;
  again:=public.reserve_subscription_payment_method_attempt(business_id,actor_id,'cus_method_fixture','sub_method_fixture',false);
  perform pg_temp.method_assert(first_attempt=again,'concurrent begin reuses durable generation');
  perform pg_temp.method_assert(first_attempt->>'baseline_payment_method_id'='pm_baseline','initial effective method baseline is durable');
  perform pg_temp.method_reject(format('select public.reserve_subscription_payment_method_attempt(%L,%L,%L,%L,true)',business_id,actor_id,'cus_method_fixture','sub_method_fixture'),'PAYMENT_METHOD_ACTIVE_ATTEMPT_CONFLICT');
  perform public.bind_subscription_payment_method_attempt(first_id,'cs_method_fixture','req_fixture');
  reset role;
  -- A real transfer retains a valid canonical owner/email pair. Identity
  -- triggers stay enabled while the earlier owner's attempt is rejected.
  update public.salons set user_id=replacement_owner_id,email=replacement_owner_email where id=business_id;
  set local role service_role;
  perform pg_temp.method_reject(format('select public.claim_subscription_payment_method_attempt(%L,%L,%L)',first_id,'cs_method_fixture',lease_one),'PAYMENT_METHOD_OWNER_IDENTITY_CONFLICT');
  reset role;
  update public.salons set user_id=actor_id,email=actor_email where id=business_id;
  set local role service_role;
  perform pg_temp.method_reject(format('select public.bind_subscription_payment_method_attempt(%L,%L)',first_id,'cs_foreign'),'PAYMENT_METHOD_SESSION_BIND_REJECTED');
  perform pg_temp.method_reject(format('select public.claim_subscription_payment_method_attempt(%L,%L,%L)',first_id,'cs_foreign',lease_one),'PAYMENT_METHOD_SESSION_IDENTITY_CONFLICT');
  result:=public.claim_subscription_payment_method_attempt(first_id,'cs_method_fixture',lease_one);
  perform pg_temp.method_assert((result->>'claimed')::boolean,'first completion owns lease');
  result:=public.claim_subscription_payment_method_attempt(first_id,'cs_method_fixture',lease_two);
  perform pg_temp.method_assert(not (result->>'claimed')::boolean,'parallel return webhook cannot claim');
  perform pg_temp.method_assert(not public.finish_subscription_payment_method_attempt(first_id,lease_two,'cancelled'),'wrong lease cannot cancel');
  perform pg_temp.method_reject(format('select public.mark_subscription_payment_method_apply(%L,%L,%L,%L)',first_id,lease_two,'seti_fixture','pm_fixture'),'PAYMENT_METHOD_LEASE_LOST');
  result:=public.mark_subscription_payment_method_apply(first_id,lease_one,'seti_fixture','pm_fixture');
  first_apply:=result->>'first_apply_at';
  perform pg_temp.method_assert(first_apply is not null,'provider boundary time durable before write');
  perform pg_temp.method_reject(format('select public.mark_subscription_payment_method_apply(%L,%L,%L,%L)',first_id,lease_one,'seti_fixture','pm_other'),'PAYMENT_METHOD_APPLY_IDENTITY_CONFLICT');
  update public.subscription_payment_method_attempts set lease_expires_at=now()-interval '1 second' where id=first_id;
  result:=public.claim_subscription_payment_method_attempt(first_id,'cs_method_fixture',lease_two);
  perform pg_temp.method_assert((result->>'claimed')::boolean,'uncertain completion resumes same generation after lease expiry');
  result:=public.mark_subscription_payment_method_apply(first_id,lease_two,'seti_fixture','pm_fixture');
  perform pg_temp.method_assert(result->>'first_apply_at'=first_apply,'lease recovery cannot reset provider idempotency clock');
  perform pg_temp.method_assert(not public.finish_subscription_payment_method_attempt(first_id,lease_one,'completed','seti_fixture','pm_fixture'),'stale worker cannot finalize');
  perform pg_temp.method_reject(format('select public.finish_subscription_payment_method_attempt(%L,%L,%L)',first_id,lease_two,'completed'),'PAYMENT_METHOD_COMPLETION_IDENTITY_MISSING');
  perform pg_temp.method_assert(public.finish_subscription_payment_method_attempt(first_id,lease_two,'completed','seti_fixture','pm_fixture','req_done'),'verified lease can finalize');
  second_attempt:=public.reserve_subscription_payment_method_attempt(business_id,actor_id,'cus_method_fixture','sub_method_fixture',false);
  second_id:=(second_attempt->>'id')::uuid;
  perform pg_temp.method_assert(second_id<>first_id,'new update has fresh generation');
  result:=public.claim_subscription_payment_method_attempt(first_id,'cs_method_fixture',lease_one);
  perform pg_temp.method_assert(not (result->>'claimed')::boolean,'old completed replay cannot become active');
  perform pg_temp.method_assert(not public.finish_subscription_payment_method_attempt(first_id,lease_two,'open'),'old completed attempt cannot reopen');
  perform public.bind_subscription_payment_method_attempt(second_id,'cs_method_second');
  perform public.claim_subscription_payment_method_attempt(second_id,'cs_method_second',lease_one);
  perform pg_temp.method_assert(public.finish_subscription_payment_method_attempt(second_id,lease_one,'cancelled'),'cancel has durable terminal result');
  result:=public.claim_subscription_payment_method_attempt(second_id,'cs_method_second',lease_two);
  perform pg_temp.method_assert(not (result->>'claimed')::boolean,'cancelled replay cannot apply');
  perform pg_temp.method_assert((select count(*)=2 from public.subscription_payment_method_attempts where salon_id=business_id),'terminal history is preserved');
  reset role;
  perform pg_temp.method_assert((select to_jsonb(s)=before_subscription from public.subscriptions s where salon_id=business_id),'attempt RPCs never mutate plan subscription or schedule');
end $$;
rollback;
