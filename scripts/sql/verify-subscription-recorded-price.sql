-- Disposable isolated database only. All fixtures roll back.
begin;
-- The local Supabase harness omits default public grants. This transaction-only
-- grant exercises RLS even on deployments where the Data API has those grants.
-- It is rolled back and is not part of the application migration.
grant select,update on public.subscriptions to authenticated;
create function pg_temp.price_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Subscription price assertion: %',label;end if;end $$;
do $$
declare
 actor uuid:=gen_random_uuid(); foreign_actor uuid:=gen_random_uuid();
 business uuid:=gen_random_uuid(); foreign_business uuid:=gen_random_uuid();
 snapshot jsonb:='{"price_id":"price_retired","amount_cents":5900,"currency":"usd","interval":"month","interval_count":1,"quantity":1,"observed_at":"2026-09-18T21:35:00Z"}';
 invalid jsonb; rejected boolean; affected integer;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 (actor,'price-a@example.test','',now(),'{"role":"salon_owner"}'),(foreign_actor,'price-b@example.test','',now(),'{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier) values
 (business,actor,'Price A','price-a','price-a@example.test','Active','active','Starter'),
 (foreign_business,foreign_actor,'Price B','price-b','price-b@example.test','Active','active','Starter');
 insert into public.subscriptions(salon_id,tier,status,price_id,stripe_subscription_id,recurring_price_snapshot) values
 (business,'Starter','active','price_retired','sub_recorded_a',snapshot),
 (foreign_business,'Starter','active','price_other','sub_recorded_b',null);
 perform pg_temp.price_assert((select recurring_price_snapshot->>'amount_cents'='5900' from public.subscriptions where salon_id=business),'old amount is not new-sale catalog price');
 perform pg_temp.price_assert((select recurring_price_snapshot is null from public.subscriptions where salon_id=foreign_business),'unknown agreement stays unknown');
 foreach invalid in array array[
   snapshot||'{"price_id":"price_unrelated"}'::jsonb,
   snapshot||'{"amount_cents":null}'::jsonb,
   snapshot||'{"currency":null}'::jsonb,
   snapshot||'{"amount_cents":-1}'::jsonb,
   snapshot||'{"amount_cents":59.5}'::jsonb,
   snapshot||'{"amount_cents":"5900"}'::jsonb,
   snapshot||'{"currency":"eur"}'::jsonb,
   snapshot||'{"quantity":2}'::jsonb,
   snapshot||'{"interval":"year"}'::jsonb,
   snapshot||'{"payment_details":"not permitted"}'::jsonb,
   snapshot-'observed_at'
 ] loop
  rejected:=false;
  begin update public.subscriptions set recurring_price_snapshot=invalid where salon_id=business;
  exception when check_violation then rejected:=true;end;
  perform pg_temp.price_assert(rejected,'malformed/mismatched provider snapshot rejected');
 end loop;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 execute 'set local role authenticated';
 perform pg_temp.price_assert((select count(*)=1 from public.subscriptions where salon_id in(business,foreign_business)),'only own agreement can be read');
 update public.subscriptions set recurring_price_snapshot=snapshot||'{"amount_cents":1}'::jsonb where salon_id=business;
 get diagnostics affected=row_count;
 perform pg_temp.price_assert(affected=0,'owner cannot forge provider amount');
 execute 'reset role';
 perform pg_temp.price_assert((select recurring_price_snapshot=snapshot from public.subscriptions where salon_id=business),'persisted price remains intact after unauthorized write');
end $$;
rollback;
