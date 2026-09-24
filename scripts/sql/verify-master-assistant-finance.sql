-- Disposable fixture, rolled back; no real payment provider is contacted.
begin;
create temporary table finance_assertions(label text);
grant insert,select on finance_assertions to service_role;
create function pg_temp.fassert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assistant finance: %',label;end if;insert into finance_assertions values(label);end $$;
create function pg_temp.freject(command text,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then denied:=true;else raise;end if;end;perform pg_temp.fassert(denied,expected);end $$;
create function pg_temp.fdraft(b uuid,a uuid,args jsonb) returns jsonb language plpgsql as $$declare preview jsonb;begin
 preview:=public.preview_gc_finance_record(b,a,args);
 return public.save_gc_assistant_request(jsonb_build_object('id',gen_random_uuid(),'salon_id',b,'requested_by',a,'locale','en','tool','prepare_finance_record','arguments',args,'execution_payload',preview->'payload','before_summary',preview->'before','risk_class',4,'permission','finance_manage','digest',repeat('a',64)),'[]'::jsonb);
end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();manager uuid:=gen_random_uuid();professional uuid:=gen_random_uuid();foreign_professional uuid:=gen_random_uuid();sale uuid:=gen_random_uuid();foreign_sale uuid:=gen_random_uuid();receipt uuid:=gen_random_uuid();
 args jsonb;expense jsonb;draft jsonb;result jsonb;again jsonb;records jsonb;k text;count_before bigint;before_notifications bigint;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)values(oa,'assistant-finance-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'assistant-finance-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'assistant-finance-staff@example.test','',now(),'{"role":"salon_team"}'),(manager,'assistant-finance-manager@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id in(staff,manager);
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,time_zone)values(a,oa,'Finance A','assistant-finance-a','assistant-finance-a@example.test','Active','active','Premium','America/New_York'),(b,ob,'Finance B','assistant-finance-b','assistant-finance-b@example.test','Active','active','Premium','America/New_York');
 insert into public.stylists(id,salon_id,name,is_active)values(professional,a,'Owned professional',true),(foreign_professional,b,'Foreign professional',true);
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions,stylist_id)values(a,staff,'assistant-finance-staff@example.test','Logger','Stylist','Active','{"finance_log":true}',professional),(a,manager,'assistant-finance-manager@example.test','Manager','Manager','Active','{"finance_manage":true}',null);
 insert into public.business_finance_sales(id,salon_id,occurred_at,source,kind,name,stylist_id,list_cents,created_by)values(sale,a,now()-interval '2 days','phone','service','Owned service',professional,20000,oa),(foreign_sale,b,now()-interval '2 days','phone','service','OTHER BUSINESS SECRET',foreign_professional,10000,ob);
 insert into public.business_finance_receipts(id,salon_id,sale_id,occurred_at,stage,method,amount_cents,created_by)values(receipt,a,sale,now()-interval '2 days','balance','cash',4000,oa);
 expense:=jsonb_build_object('action','expense','record_id',null,'record_kind',null,'amount_cents',2500,'date',to_char((now()-interval '1 day') at time zone 'America/New_York','YYYY-MM-DD'),'time','12:00','method',null,'category','Supplies','treatment','operating','note','Owner confirmed already paid.','money_already_moved',true);
 select count(*) into before_notifications from public.notification_delivery_log;
 perform set_config('request.jwt.claim.role','service_role',true);set local role service_role;
 records:=public.read_gc_finance_records(a,oa,now()-interval '3 days',now());
 perform pg_temp.fassert(records->>'salon_id'=a::text and records->'totals'->>'sale'='1' and records->'totals'->>'receipt'='1','scoped own totals');
 perform pg_temp.fassert(position('OTHER BUSINESS' in records::text)=0,'foreign data never projected');
 perform pg_temp.freject(format('select public.read_gc_finance_records(%L,%L,now()-interval ''3 days'',now())',b,oa),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.freject(format('select public.read_gc_finance_records(%L,%L,now()-interval ''32 days'',now())',a,oa),'ASSISTANT_INVALID_DATE_RANGE');
 perform pg_temp.freject(format('select public.preview_gc_finance_record(%L,%L,%L)',a,staff,expense),'ASSISTANT_ACCESS_DENIED');
 draft:=pg_temp.fdraft(a,oa,expense);
 perform pg_temp.fassert(not exists(select 1 from public.business_finance_expenses where salon_id=a),'preview never writes');
 perform pg_temp.freject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',draft->>'id',b,ob,repeat('a',64)),'ASSISTANT_REQUEST_NOT_FOUND');
 perform pg_temp.freject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',draft->>'id',a,oa,repeat('b',64)),'ASSISTANT_PREVIEW_STALE');
 result:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));
 perform pg_temp.fassert(result->>'verified'='true','expense confirm: '||result::text);
 perform pg_temp.fassert((select amount_cents=2500 and category='Supplies' and treatment='operating' from public.business_finance_expenses where id=(result->'result'->>'id')::uuid),'durable exact expense');
 again:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.fassert(again->>'replayed'='true' and again->'result'=result->'result','same-record replay readback');
 perform pg_temp.fassert((select count(*)=1 from public.business_finance_expenses where salon_id=a),'no duplicate on replay');
 -- Database validates all required arguments even if the application is bypassed.
 foreach k in array array['action','amount_cents','date','time','note','money_already_moved','category','treatment']loop
  perform pg_temp.freject(format('select public.preview_gc_finance_record(%L,%L,%L)',a,oa,jsonb_set(expense,array[k],'null')),'ASSISTANT_INVALID');
 end loop;
 perform pg_temp.freject(format('select public.preview_gc_finance_record(%L,%L,%L)',a,oa,expense||'{"salon_id":"spoof"}'),'ASSISTANT_INVALID_INPUT');
 perform pg_temp.freject(format('select public.preview_gc_finance_record(%L,%L,%L)',a,oa,expense||'{"amount_cents":2.5}'),'ASSISTANT_INVALID_INPUT');
 draft:=pg_temp.fdraft(a,manager,expense);result:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,manager,repeat('a',64));perform pg_temp.fassert(result->>'verified'='true','fresh finance_manage delegation');
 draft:=pg_temp.fdraft(a,manager,expense);reset role;update public.salon_team_members set permissions='{}' where user_id=manager;set local role service_role;
 perform pg_temp.freject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',draft->>'id',a,manager,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 args:=expense||jsonb_build_object('action','receipt','record_id',sale,'record_kind','sale','category',null,'treatment',null,'method','cash','amount_cents',1000);
 perform pg_temp.freject(format('select public.preview_gc_finance_record(%L,%L,%L)',a,oa,args||jsonb_build_object('record_id',foreign_sale)),'ASSISTANT_RECORD_NOT_FOUND');
 draft:=pg_temp.fdraft(a,oa,args);result:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.fassert(result->>'verified'='true','received balance recorded: '||result::text);
 perform pg_temp.fassert((select sum(amount_cents)=5000 from public.business_finance_receipts where sale_id=sale),'received amount exact');
 draft:=pg_temp.fdraft(a,oa,args);perform public.record_business_finance(a,oa,gen_random_uuid(),'receipt',draft->'execution_payload'->'finance_payload');result:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.fassert(result->>'code'='ASSISTANT_PREVIEW_STALE','intervening receipt invalidates review');
 args:=expense||jsonb_build_object('action','refund','record_id',receipt,'record_kind','receipt','category',null,'treatment',null,'method',null,'amount_cents',1000);
 draft:=pg_temp.fdraft(a,oa,args);result:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.fassert(result->>'verified'='true','already returned refund recorded: '||result::text);
 perform pg_temp.fassert((select amount_cents=1000 and method='cash' and original_payment_id=receipt and stage='refund' from public.business_finance_receipts where id=(result->'result'->>'id')::uuid),'refund preserves method and original receipt');
 perform pg_temp.freject(format('select public.preview_gc_finance_record(%L,%L,%L)',a,oa,args||'{"amount_cents":3001}'),'ASSISTANT_FINANCE_AMOUNT_EXCEEDS_REMAINING');
 draft:=pg_temp.fdraft(a,oa,expense);update public.gc_assistant_requests set execution_payload=jsonb_set(execution_payload,'{finance_payload,amount_cents}','1') where id=(draft->>'id')::uuid;
 result:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.fassert(result->>'code'='ASSISTANT_PREVIEW_STALE','tampered payload rejected');
 perform pg_temp.fassert((select count(*)=before_notifications from public.notification_delivery_log),'no notification dispatched');
 perform pg_temp.fassert(not exists(select 1 from public.bookings where salon_id=a),'no appointments created');
 perform pg_temp.fassert(not has_function_privilege('authenticated','public.preview_gc_finance_record(uuid,uuid,jsonb)','execute'),'no browser permission bypass');
 reset role;
end $$;
select count(*) as passed from finance_assertions;
rollback;
