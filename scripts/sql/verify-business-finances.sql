-- Disposable fixture only. Transaction always rolls back; never production.
begin;
create function pg_temp.finance_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Finance assertion failed: %',label; end if; end $$;
create function pg_temp.finance_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin begin execute command; exception when others then if position(expected in sqlerrm)>0 then rejected:=true; else raise; end if; end;
  perform pg_temp.finance_assert(rejected,expected); end $$;
do $$
#variable_conflict error
<<finance_test>>
declare owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid(); staff_a uuid:=gen_random_uuid(); desk_a uuid:=gen_random_uuid();
  business_a uuid:=gen_random_uuid(); business_b uuid:=gen_random_uuid(); stylist_a uuid:=gen_random_uuid(); stylist_b uuid:=gen_random_uuid(); stylist_peer uuid:=gen_random_uuid();
  request_key uuid:=gen_random_uuid(); payload jsonb; result jsonb; same_result jsonb; own_data jsonb; sale_id uuid; receipt_id uuid;
  agreement_id uuid; obligation_id uuid; booking_key uuid:=gen_random_uuid();
begin
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
    (owner_a,'books-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(owner_b,'books-owner-b@example.test','',now(),'{"role":"salon_owner"}'),
    (staff_a,'books-stylist@example.test','',now(),'{"role":"salon_team"}'),(desk_a,'books-desk@example.test','',now(),'{"role":"salon_team"}');
  update public.platform_identities set primary_role='salon_team' where user_id in (staff_a,desk_a);
  insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier) values
    (business_a,owner_a,'Books A','books-a','books-owner-a@example.test','Active','active','Gold'),
    (business_b,owner_b,'Books B','books-b','books-owner-b@example.test','Active','active','Gold');
  insert into public.stylists(id,salon_id,name) values(stylist_a,business_a,'Stylist A'),(stylist_peer,business_a,'Peer A'),(stylist_b,business_b,'Stylist B');
  insert into public.salon_team_members(salon_id,user_id,stylist_id,email,name,role,status,permissions) values
    (business_a,staff_a,stylist_a,'books-stylist@example.test','Stylist A','Stylist','Active','{"earnings_own":true}'),
    (business_a,desk_a,null,'books-desk@example.test','Desk A','Front Desk','Active','{"finance_log":true}');
  perform set_config('request.jwt.claim.role','service_role',true);
  payload:=jsonb_build_object('kind','service','source','walk_in','name','Box Braids','stylist_id',stylist_a,'list_cents',10000,'discount_cents',2000,'method','cash');
  result:=public.record_business_finance(business_a,desk_a,request_key,'sale',payload);
  sale_id:=(result->>'id')::uuid;
  same_result:=public.record_business_finance(business_a,desk_a,request_key,'sale',payload);
  perform pg_temp.finance_assert(result=same_result,'retry returns original result');
  perform pg_temp.finance_assert((select count(*)=1 and sum(agreed_cents)=8000 from public.business_finance_sales where salon_id=business_a),'no duplicate sale');
  perform pg_temp.finance_assert((select count(*)=1 and sum(amount_cents)=8000 from public.business_finance_receipts where salon_id=business_a),'one actual full receipt');
  perform pg_temp.finance_reject(format('select public.record_business_finance(%L,%L,%L,%L,%L::jsonb)',business_a,desk_a,request_key,'sale',payload||'{"list_cents":11000}'),'FINANCE_REQUEST_CONFLICT');
  perform pg_temp.finance_reject(format('select public.record_business_finance(%L,%L,%L,%L,%L::jsonb)',business_b,owner_a,gen_random_uuid(),'sale',payload),'FINANCE_ACCESS_DENIED');
  perform pg_temp.finance_reject(format('select public.record_business_finance(%L,%L,%L,%L,%L::jsonb)',business_a,owner_a,gen_random_uuid(),'sale',payload||jsonb_build_object('stylist_id',stylist_b)),'FINANCE_RECORD_NOT_FOUND');
  perform pg_temp.finance_reject(format('select public.read_business_finance(%L,%L)',business_a,desk_a),'FINANCE_ACCESS_DENIED');
  perform pg_temp.finance_reject(format('select public.read_business_finance(%L,%L)',business_b,staff_a),'FINANCE_ACCESS_DENIED');
  perform pg_temp.finance_reject(format('select public.record_business_finance(%L,%L,%L,%L,%L::jsonb)',business_a,staff_a,gen_random_uuid(),'sale',payload),'FINANCE_ACCESS_DENIED');
  perform public.record_business_finance(business_a,owner_a,gen_random_uuid(),'sale',payload||jsonb_build_object('stylist_id',stylist_peer));
  perform public.record_business_finance(business_b,owner_b,gen_random_uuid(),'sale',payload||jsonb_build_object('stylist_id',stylist_b));
  perform public.record_business_finance(business_a,owner_a,gen_random_uuid(),'expense','{"category":"Rent","amount_cents":10000,"treatment":"operating"}');
  own_data:=public.read_business_finance(business_a,staff_a);
  perform pg_temp.finance_assert(own_data->'scope'->>'kind'='own' and jsonb_array_length(own_data->'sales')=1 and jsonb_array_length(own_data->'receipts')=1,'own stylist gets only own sales and receipts');
  perform pg_temp.finance_assert(own_data->'expenses'='[]' and jsonb_array_length(own_data->'stylists')=1,'own earnings excludes expenses and peer identities');
  perform pg_temp.finance_assert(own_data->'product_orders'='[]' and own_data->'product_refunds'='[]' and own_data->'sales'->0->>'client_name' is null and own_data->'sales'->0->>'cost_cents' is null,'own earnings hides business product books, client names and costs');
  payload:=jsonb_build_object('id',gen_random_uuid(),'salon_id',business_a,'requested_by',staff_a,'locale','en','tool','get_earnings_summary','arguments','{}'::jsonb,'execution_payload','{}'::jsonb,'risk_class',1,'permission','earnings','digest',repeat('a',64),'before_summary','{}'::jsonb,'result',jsonb_build_object('scope','own_stylist_only','scope_stylist_id',stylist_a,'completed_sales_cents',8000));
  result:=public.save_gc_assistant_request(payload,'[]');
  perform pg_temp.finance_assert(result->'result'->>'scope_stylist_id'=stylist_a::text,'own earnings request can be saved without full finance permission');
  perform pg_temp.finance_reject(format('select public.save_gc_assistant_request(%L::jsonb,%L::jsonb)',payload||jsonb_build_object('id',gen_random_uuid(),'result',jsonb_build_object('scope','authenticated_business_only')),'[]'),'ASSISTANT_ACCESS_DENIED');
  perform pg_temp.finance_reject(format('select public.save_gc_assistant_request(%L::jsonb,%L::jsonb)',payload||jsonb_build_object('id',gen_random_uuid(),'result',jsonb_build_object('scope','own_stylist_only','scope_stylist_id',stylist_peer)),'[]'),'ASSISTANT_ACCESS_DENIED');
  perform set_config('request.jwt.claim.sub',staff_a::text,true);
  set local role authenticated;
  perform pg_temp.finance_assert((select count(*)=0 from public.gc_assistant_requests),'direct REST cannot expose even own historical raw results');
  reset role;
  perform pg_temp.finance_assert(jsonb_array_length(public.read_business_finance(business_a,owner_a)->'sales')=2,'owner sees own business total only');
  select id into receipt_id from public.business_finance_receipts where salon_id=business_a and business_finance_receipts.sale_id=finance_test.sale_id;
  perform pg_temp.finance_reject(format('select public.record_business_finance(%L,%L,%L,%L,%L::jsonb)',business_b,owner_b,gen_random_uuid(),'refund',jsonb_build_object('original_payment_id',receipt_id,'amount_cents',100,'note','Wrong business')),'FINANCE_RECORD_NOT_FOUND');
  payload:=jsonb_build_object('original_payment_id',receipt_id,'amount_cents',2000,'note','Recorded cash refund');
  perform public.record_business_finance(business_a,owner_a,gen_random_uuid(),'refund',payload);
  perform pg_temp.finance_reject(format('select public.record_business_finance(%L,%L,%L,%L,%L::jsonb)',business_a,owner_a,gen_random_uuid(),'refund',payload||'{"amount_cents":7000}'),'FINANCE_INVALID_REFUND');
  perform pg_temp.finance_assert((select sum(case stage when 'refund' then -amount_cents else amount_cents end)=6000 from public.business_finance_receipts r where r.salon_id=business_a and r.sale_id=finance_test.sale_id),'refund linked once without rewriting receipt');
  payload:=jsonb_build_object('stylist_id',stylist_a,'effective_from',current_date,'kind','commission','basis','after_discount','percent',50);
  result:=public.record_business_finance(business_a,owner_a,gen_random_uuid(),'arrangement',payload);
  agreement_id:=(result->>'id')::uuid;
  perform pg_temp.finance_assert((select compensation->>'kind'='none' from public.business_finance_sales s where s.id=finance_test.sale_id),'new arrangement leaves prior sale unchanged');
  payload:=jsonb_build_object('kind','service','source','phone','name','Silk Press','stylist_id',stylist_a,'list_cents',10000,'discount_cents',2000,'method','transfer');
  result:=public.record_business_finance(business_a,owner_a,gen_random_uuid(),'sale',payload);
  perform pg_temp.finance_assert((select compensation->>'version'=agreement_id::text and compensation->>'percent'='50.00' from public.business_finance_sales where id=(result->>'id')::uuid),'sale freezes effective commission version');
  payload:=jsonb_build_object('stylist_id',stylist_peer,'effective_from',current_date,'kind','booth','amount_cents',25000,'period','week');
  result:=public.record_business_finance(business_a,owner_a,gen_random_uuid(),'arrangement',payload);
  agreement_id:=(result->>'id')::uuid;
  payload:=jsonb_build_object('arrangement_version',agreement_id,'period_start',current_date,'due_at',now());
  result:=public.record_business_finance(business_a,owner_a,gen_random_uuid(),'obligation',payload);
  obligation_id:=(result->>'id')::uuid;
  perform pg_temp.finance_assert((select amount_cents=25000 and period_end=period_start+6 from public.business_compensation_obligations where id=obligation_id),'rent obligation uses recorded agreement and exact week');
  payload:=jsonb_build_object('stylist_id',stylist_peer,'obligation_id',obligation_id,'kind','booth_rent','amount_cents',10000,'method','cash');
  perform public.record_business_finance(business_a,owner_a,gen_random_uuid(),'compensation_payment',payload);
  perform pg_temp.finance_reject(format('select public.record_business_finance(%L,%L,%L,%L,%L::jsonb)',business_a,owner_a,gen_random_uuid(),'compensation_payment',payload||'{"amount_cents":20000}'),'FINANCE_PAYMENT_EXCEEDS_DUE');
  perform pg_temp.finance_assert((select count(*)=0 from public.business_finance_sales where salon_id=business_b and created_by=owner_a),'no foreign write');
  update public.salon_team_members set permissions='{}' where salon_id=business_a and user_id=staff_a;
  perform pg_temp.finance_reject(format('select public.read_business_finance(%L,%L)',business_a,staff_a),'FINANCE_ACCESS_DENIED');
  update public.platform_identities set status='Disabled' where user_id=owner_a;
  perform pg_temp.finance_reject(format('select public.read_business_finance(%L,%L)',business_a,owner_a),'FINANCE_ACCESS_DENIED');
  perform pg_temp.finance_assert(not has_table_privilege('authenticated','public.business_finance_sales','select') and not has_table_privilege('anon','public.business_finance_receipts','insert'),'no direct browser ledger access');
  perform pg_temp.finance_assert(not has_function_privilege('authenticated','public.read_business_finance(uuid,uuid)','execute') and not has_function_privilege('authenticated','public.record_business_finance(uuid,uuid,uuid,text,jsonb)','execute'),'no forged browser actor RPC');
end finance_test $$;
rollback;
