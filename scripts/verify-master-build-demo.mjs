import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {typescriptLoader} from '../tests/helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd());
const {operatingBooksFromData}=load('src/lib/businessFinanceData.ts');
const {summarizeOperatingBooks}=load('src/lib/businessFinanceCore.ts');
const source=new URL(process.env.CLEAN_DATABASE_URL||'');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(source.hostname));
assert.match(source.pathname,/^\/girlzculture_(?:[a-z_0-9]+)?(?:release|clean)$/);
// Git may check out CRLF on Windows; compare the exact SQL with only line endings normalized.
for(const name of ['seed-private-demo.sql','check-private-demo.sql','reset-private-demo.sql']){
 const migration=name==='reset-private-demo.sql'?'20260923064718_master_build_demo_workspace.sql':'20260924164000_private_business_presentation_history.sql';
 assert.ok(readFileSync('supabase/migrations/'+migration,'utf8').replaceAll('\r\n','\n').includes(readFileSync('supabase/demo/'+name,'utf8').replaceAll('\r\n','\n')),'Reviewed migration and canonical demo procedure diverged: '+name);
}
const psql=process.env.PSQL_BIN||'psql',clone='girlzculture_master_demo_'+randomUUID().replaceAll('-','');
const control=new URL(source);control.pathname='/postgres';const target=new URL(source);target.pathname='/'+clone;
function execute(url,sql){return spawnSync(psql,[url.toString(),'-X','-qAt','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:32*1024*1024});}
function run(sql){const r=execute(target,sql);assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
let checks=0;function equal(a,b,label){assert.equal(a,b,label);checks++;}
function denied(sql,pattern){const r=execute(target,sql);assert.notEqual(r.status,0,'Expected a denied database operation');assert.match(r.stderr,pattern);checks++;}
const created=execute(control,`create database ${clone} template ${source.pathname.slice(1)};`);assert.equal(created.status,0,created.stderr);
try{
 // Always exercise an already-populated version-one owner before the current seed.
 const after=process.env.MASTER_UPGRADE_AFTER || "20260923212146";
 if(after){
  const pending=readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')&&n.slice(0,14)>after).sort();
  for(const name of pending.filter(n=>n.slice(0,14)<'20260924164000'))run(readFileSync('supabase/migrations/'+name,'utf8'));
  // Upgrade a genuinely pre-populated version-one account, not just an empty schema.
  const previousOwner=randomUUID(),previousSalon=randomUUID(),neighborOwner=randomUUID(),neighborSalon=randomUUID();
  run(`insert into auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)values
   ('${previousOwner}','upgrade@private-demo.invalid','unchanged-local-fixture','{"gc_demo":true,"gc_demo_security_email":"fixture@example.test"}','{"role":"salon_owner"}'),
   ('${neighborOwner}','neighbor@example.test','unchanged-local-neighbor','{}','{"role":"salon_owner"}');
   insert into public.salons(id,user_id,name,slug,email,is_demo)values
   ('${previousSalon}','${previousOwner}','Previous presentation','previous-${previousSalon}','upgrade@private-demo.invalid',true),
   ('${neighborSalon}','${neighborOwner}','Unchanged neighboring business','neighbor-${neighborSalon}','neighbor@example.test',false);`);
  const old=JSON.parse(run(`select public.seed_private_demo('${previousSalon}','${previousOwner}',current_date);`));
  equal(old.bookings<600,true,'representative upgrade starts from the small former history');
  const stamp=run(`select seeded_at from gc_private.demo_workspaces where salon_id='${previousSalon}';`);
  const graph=run(`select md5(jsonb_agg(to_jsonb(b) order by id)::text) from public.bookings b where salon_id='${previousSalon}';`);
  const untouched=run(`select md5(to_jsonb(s)::text) from public.salons s where id='${neighborSalon}';`);
  for(const name of pending.filter(n=>n.slice(0,14)>='20260924164000'))run(readFileSync('supabase/migrations/'+name,'utf8'));
  equal(run(`select md5(jsonb_agg(to_jsonb(b) order by id)::text) from public.bookings b where salon_id='${previousSalon}';`),graph,'installing the migration never refreshes data implicitly');
  const refreshed=JSON.parse(run(`select public.reset_private_demo('${previousSalon}','${previousOwner}','${stamp}','RESET PRIVATE DEMO');`));
  equal(refreshed.bookings>2500,true,'the exact previous business gains a substantial history');
  equal(run(`select user_id::text from public.salons where id='${previousSalon}';`),previousOwner,'the owner/business association is unchanged');
  equal(run(`select encrypted_password||':'||(raw_app_meta_data->>'gc_demo_security_email') from auth.users where id='${previousOwner}';`),'unchanged-local-fixture:fixture@example.test','password and MFA destination survive the refresh');
  equal(run(`select md5(to_jsonb(s)::text) from public.salons s where id='${neighborSalon}';`),untouched,'the neighboring real business remains byte-for-byte unchanged');
  equal(JSON.parse(run(`select public.check_private_demo('${previousSalon}');`)).passed,true,'upgraded account reconciles before commit');
 }
 const demo=randomUUID(),real=randomUUID(),sid=randomUUID(),realSid=randomUUID(),stylist=randomUUID();
 run(`insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)values
 ('${demo}','owner@private-demo.invalid','',now(),'{"gc_demo":true}','{"role":"salon_owner"}'),
 ('${real}','owner@example.test','',now(),'{}','{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email)values('${realSid}','${real}','Real fixture','real-${realSid}','owner@example.test');`);
 // Exercise RLS independently of this minimal local bootstrap's narrower table grants.
 run("grant select on public.stylists to authenticated;");
 const before=run('select row_to_json(m) from public.platform_admin_overview_metrics() m;');
 run(`insert into public.salons(id,user_id,name,slug,email,is_demo,is_discoverable,accepting_bookings)values('${sid}','${demo}','Sample salon','demo-${sid}','owner@private-demo.invalid',true,true,true);`);
 equal(run(`select is_discoverable||':'||accepting_bookings from public.salons where id='${sid}';`),'false:false','demo cannot be public');
 equal(run(`select count(*) from gc_private.demo_workspaces where salon_id='${sid}' and owner_id='${demo}';`),'1','private registry');
 equal(run(`select count(*) from public.test_data_registry where record_type='salon' and record_id='${sid}';`),'1','existing public route guards recognize sample');
 equal(run('select row_to_json(m) from public.platform_admin_overview_metrics() m;'),before,'sample does not change platform metrics');
 denied(`update public.salons set is_demo=false where id='${sid}';`,/DEMO_CLASSIFICATION_IMMUTABLE/);
 denied(`update public.salons set is_demo=true where id='${realSid}';`,/DEMO_CLASSIFICATION_IMMUTABLE/);
 denied(`update public.salons set email='recipient@example.test' where id='${sid}';`,/DEMO_CONTACT_ONLY/);
 denied(`update public.salons set stripe_account_id='acct_invalid_fixture' where id='${sid}';`,/DEMO_PROVIDER_ACTION_DISABLED/);
 denied(`update auth.users set raw_app_meta_data='{}' where id='${demo}';`,/DEMO_CLASSIFICATION_IMMUTABLE/);
 denied(`update auth.users set email='recipient@example.test' where id='${demo}';`,/DEMO_CONTACT_ONLY/);
 run(`insert into public.stylists(id,salon_id,name,slug)values('${stylist}','${sid}','Sample professional','sample-professional');`);
 equal(run(`select is_demo from public.stylists where id='${stylist}';`),'t','classification derived before writes');
 denied(`update public.stylists set salon_id='${realSid}' where id='${stylist}';`,/BUSINESS_SCOPE_IMMUTABLE/);
 denied(`update public.stylists set user_id='${real}' where id='${stylist}';`,/DEMO_IDENTITY_BOUNDARY/);
 equal(run(`begin;set local role anon;select count(*) from public.salons where id='${sid}';rollback;`),'0','anonymous demo visibility');
 equal(run(`begin;set local role authenticated;set local request.jwt.claim.sub='${real}';select count(*) from public.stylists where salon_id='${sid}';rollback;`),'0','other business sample records hidden');
 equal(run(`begin;set local role authenticated;set local request.jwt.claim.sub='${demo}';select count(*) from public.stylists where salon_id='${sid}';rollback;`),'1','owner can demonstrate own records');
 equal(run(`select public.demo_delivery_actor_ids(array['${demo}'::uuid,'${real}'::uuid])::text;`),`{${demo}}`,'push delivery suppression excludes only sample actors');
 denied(`delete from public.test_data_registry where record_type='salon' and record_id='${sid}';`,/DEMO_CLASSIFICATION_IMMUTABLE/);
 run(`delete from public.stylists where id='${stylist}';`);
 // Exercise the procedures installed by the migration chain, not local replacements.
 // Reproduce the hosted Engine catalog: these historical exact labels no
 // longer represent active choices. A private demo must not restore them.
 run("update public.master_styles set is_active=false,archived_at=now() where name in ('Locs','Cornrows','Feed-in Braids');");
 const catalogBefore=run("select md5(jsonb_agg(to_jsonb(m) order by id)::text) from public.master_styles m;");
 const unseededBefore=run(`select to_jsonb(s)::text from public.salons s where id='${sid}';`);
 denied(`begin;update public.service_groups set is_active=false where name='Locs';select public.seed_private_demo('${sid}','${demo}',current_date);commit;`,/DEMO_SERVICE_GROUP_REQUIRED/);
 equal(run(`select to_jsonb(s)::text from public.salons s where id='${sid}';`),unseededBefore,'missing active group rolls back every profile and child write');
 equal(run(`select count(*) from public.styles where salon_id='${sid}';`),'0','failed seed leaves no partial services');
 const seeded=JSON.parse(run(`select public.seed_private_demo('${sid}','${demo}',current_date);`));
 equal(run("select md5(jsonb_agg(to_jsonb(m) order by id)::text) from public.master_styles m;"),catalogBefore,'demo seed must not change the managed platform catalog');
 equal(run(`select count(*) from public.styles s join public.service_groups g on g.id=s.service_group_id join public.service_categories c on c.id=g.category_id where s.salon_id='${sid}' and s.master_style_id is null and s.category_id=c.id and g.is_active and g.archived_at is null and c.is_active and c.archived_at is null;`),'6','all six fictional services retain active canonical group/category references');
 equal(run(`select count(*) from public.stylists t where salon_id='${sid}' and jsonb_array_length(specialties)>0 and not exists(select 1 from jsonb_array_elements_text(t.specialties) s(name) where not exists(select 1 from public.master_styles m join public.service_groups g on g.id=m.service_group_id where m.name=s.name and m.is_active and m.archived_at is null and g.name in ('Braids','Protective Styles','Locs','Cornrows','Twists')));`),'6','fictional hair-team specialties retain managed validation and exclude unrelated services');
 const expectedBookings=seeded.bookings;equal(expectedBookings>2500&&expectedBookings<5000,true,'substantial, capacity-bounded history');
 const firstUpcoming=run(`select gc_private.demo_record_id('${sid}','upcoming',0);`);
 const sampleClient=run(`select customer_id from public.bookings where id='${firstUpcoming}';`);
 const card=JSON.parse(run(`select public.read_business_client_card('${sid}','${demo}','${firstUpcoming}');`));
 equal(card.visit_count,Number(run(`select count(*) from public.bookings where salon_id='${sid}' and customer_id='${sampleClient}';`)),'private demo client history includes every simulated visit');
 equal(card.preferences,'Comfortable tension; protect the edges.','existing sample client preferences retained');
 equal(card.spend.completed_agreed_cents,Number(run(`select coalesce(sum(round(estimated_total*100)),0) from public.bookings where salon_id='${sid}' and customer_id='${sampleClient}' and status='Completed';`)),'client completed totals match sample bookings');
 equal(card.spend.recorded_payment_cents,Number(run(`select coalesce(sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end),0) from public.business_finance_receipts r join public.bookings b on b.id=r.booking_id and b.salon_id=r.salon_id where b.salon_id='${sid}' and b.customer_id='${sampleClient}';`)),'sample receipts are counted once without duplicate provider deposits');
 denied(`select public.read_business_client_card('${sid}','${real}','${firstUpcoming}');`,/CLIENT_ACCESS_DENIED/);
 denied(`select public.read_business_client_card('${realSid}','${demo}','${firstUpcoming}');`,/CLIENT_ACCESS_DENIED/);

 equal(run(`select count(*) from public.billing_events where salon_id='${sid}' and amount_collected=19900 and extract(day from event_date at time zone 'America/New_York')=1 and extract(hour from event_date at time zone 'America/New_York')=12;`),'14','sample Premium history uses cents and local monthly dates');
 // Representative upgrade: previously seeded owner, untouched identity and
 // booking graph, plus a real-business event which must never be rewritten.
 const billingMigration=readFileSync('supabase/migrations/20260924125427_private_demo_history_readback.sql','utf8');
 const realBilling=randomUUID();
 const bookingGraph=run(`select md5(jsonb_agg(to_jsonb(b) order by id)::text) from public.bookings b where salon_id='${sid}';`);
 run(`update public.billing_events set amount_collected=199,event_date=date_trunc('month',event_date at time zone 'America/New_York') at time zone 'UTC' where salon_id='${sid}' and event_type='sample_subscription';
 insert into public.billing_events(id,salon_id,stripe_event_id,event_date,event_type,new_plan,amount_collected,payment_status,metadata)values('${realBilling}','${realSid}','fixture:${realBilling}',now(),'sample_subscription','Premium',199,'Simulated','{"sample":true,"provider_charge":false}');`);
 run(billingMigration);
 equal(run(`select count(*) from public.billing_events where salon_id='${sid}' and amount_collected=19900 and extract(day from event_date at time zone 'America/New_York')=1;`),'14','existing sample billing corrected in place');
 equal(run(`select amount_collected from public.billing_events where id='${realBilling}';`),'199','real business billing never changed');
 equal(run(`select md5(jsonb_agg(to_jsonb(b) order by id)::text) from public.bookings b where salon_id='${sid}';`),bookingGraph,'billing correction preserves every booking');
 run(billingMigration);
 equal(run(`select sum(amount_collected) from public.billing_events where salon_id='${sid}';`),'278600','billing correction is idempotent');
 run(`delete from public.billing_events where id='${realBilling}';`);
 run(readFileSync('supabase/migrations/20260924164000_private_business_presentation_history.sql','utf8')); // Restore latest reviewed procedures after the historical billing regression.
 equal(run(`select count(distinct date_trunc('month',appointment_datetime)) from public.bookings where salon_id='${sid}' and appointment_datetime<date_trunc('month',current_date)+interval '1 month';`),'14','fourteen reporting periods');
 equal(JSON.parse(run(`select public.seed_private_demo('${sid}','${demo}',current_date);`)).already_seeded,true,'seed is idempotent and preserves edits');
 equal(run('select row_to_json(m) from public.platform_admin_overview_metrics() m;'),before,'populated sample never enters global totals');
 for(const table of ['business_google_connections','business_instagram_connections']){
  denied(`insert into public.${table}(salon_id,owner_id,status)values('${sid}','${demo}','disconnected');`,/DEMO_PROVIDER_ACTION_DISABLED/);
  run(`insert into public.${table}(salon_id,owner_id,status)values('${realSid}','${real}','disconnected');`);
  equal(run(`select status from public.${table} where salon_id='${realSid}';`),'disconnected','real integration storage unchanged');
 }
 const check=JSON.parse(run(`select public.check_private_demo('${sid}');`));
 for(const [key,passed] of Object.entries(check.checks))equal(passed,true,key);
 equal(check.counts.products,4,'retail products');equal(check.counts.clients,480,'private client cards');equal(check.counts.messages,112,'sample conversations');
 equal(run(`select name||':'||base_price::integer||':'||duration_min_hours::integer from public.styles where id=gc_private.demo_record_id('${sid}','service',1);`),'Boho / Knotless Braids:210:4','loose-name example has correct canonical service, price and duration');
 equal(run(`select count(*) from public.bookings where salon_id='${sid}' and schedule_revision>0;`),'1','real rescheduling revision');
 equal(run(`select count(*) from public.booking_followup_queue q join public.bookings b on b.id=q.booking_id where b.salon_id='${sid}';`),'0','no live follow-up queue');
 equal(run(`select count(*) from public.salons where id='${realSid}' and not is_demo;`),'1','real business unchanged');
 const data=JSON.parse(run(`select public.read_business_finance('${sid}','${demo}');`));
 const {books,evidence}=operatingBooksFromData(sid,data);
 equal(evidence.sample_data,true,'owner books explicitly classified as sample');equal(evidence.provider_bank_settlement_verified,false,'sample never claims bank verification');
 equal(evidence.excluded_test_bookings,0,'protected sample receipts visible in private books');
 const summary=summarizeOperatingBooks(sid,books,{from:'2020-01-01',to:'2099-12-31',timeZone:'America/New_York'});
 const totals=JSON.parse(run(`select jsonb_build_object('cash',sum(case when stage='refund' then -amount_cents else amount_cents end)) from public.business_finance_receipts where salon_id='${sid}';`));
 equal(summary.cash_received_cents,Number(totals.cash),'financial view equals authoritative receipt ledger');
 equal(summary.completed_product_sales_cents,Number(run(`select sum(agreed_cents) from public.business_finance_sales where salon_id='${sid}' and kind='product';`)),'four products over fourteen months reconcile');
 // Capacity, scale, names and connected money are release acceptance, not headline fixtures.
 equal(run(`select count(distinct customer_id) from public.bookings where salon_id='${sid}';`),'480','every client has actual connected visits');
 equal(run(`select count(*) from (select date_trunc('month',appointment_datetime at time zone 'America/New_York'),sum(estimated_total) as earned from public.bookings where salon_id='${sid}' and status='Completed' and appointment_datetime<date_trunc('month',current_date) group by 1 having sum(estimated_total)>=10000)x;`),'13','each completed month exceeds $10,000 from real linked booking rows');
 equal(run(`select count(*) from public.bookings where salon_id='${sid}' and (guest_name~*'(sample|demo|fictional)' or client_notes~*'(sample|demo|fictional)');`),'0','natural owner-facing client names and appointment notes');
 equal(run(`select count(*) from public.bookings where salon_id='${sid}' and promotion_discount_amount>0 and estimated_total+promotion_discount_amount=subtotal_before_promotion and deposit_amount=original_deposit_amount;`)!=='0',true,'historical offers preserve protected deposits');
 const balances=JSON.parse(run(`select public.read_private_booking_balances('${sid}','${demo}');`));
 equal(balances.length,Number(run(`select count(*) from public.bookings where salon_id='${sid}' and booking_origin='marketplace';`)),'receipt readback covers every provider page');
 const completedId=run(`select id from public.bookings where salon_id='${sid}' and status='Completed' and booking_origin='marketplace' limit 1;`);
 equal(balances.find(row=>row.id===completedId).remaining_cents,0,'completed paid booking has no remaining balance');
 equal(balances.find(row=>row.id===firstUpcoming).remaining_cents,7600,'upcoming booking retains its unpaid balance');
 const paidReceipt=run(`select id from public.business_finance_receipts where salon_id='${sid}' and booking_id='${completedId}' and stage='balance' limit 1;`);
 equal(run(`begin;insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,original_payment_id,note,created_by) values('${randomUUID()}','${sid}','${completedId}',now(),'refund','other',100,'${paidReceipt}','Review adjustment','${demo}');select row->>'remaining_cents' from jsonb_array_elements(public.read_private_booking_balances('${sid}','${demo}')) row where row->>'id'='${completedId}';rollback;`),'0','a refund reduces cash but never recreates a discharged booking debt');
 const noShowId=run(`select id from public.bookings where salon_id='${sid}' and status='No Show' limit 1;`);
 equal(balances.find(row=>row.id===noShowId).remaining_cents,0,'no-show receivables match the canonical finance ledger');

 denied(`select public.read_private_booking_balances('${sid}','${real}');`,/BOOKING_RECEIPT_ACCESS_DENIED/);
 denied(`select public.read_private_booking_balances('${realSid}','${demo}');`,/BOOKING_RECEIPT_ACCESS_DENIED/);
 const staff=run(`select gc_private.demo_record_id('${sid}','staff',1);`);
 const staffBalances=JSON.parse(run(`select public.read_private_booking_balances('${sid}','${staff}');`));
 equal(staffBalances.length,Number(run(`select count(*) from public.bookings where salon_id='${sid}' and stylist_id='${staff}' and booking_origin='marketplace';`)),'staff readback includes only assigned appointments');
 denied(`begin;set local role authenticated;select public.read_private_booking_balances('${sid}','${demo}');rollback;`,/permission denied/);
 denied(`insert into public.notifications(user_id,salon_id,channel,title,body)values('${demo}','${sid}','email','sample','sample');`,/DEMO_EXTERNAL_NOTIFICATION_DISABLED/);
 denied(`insert into public.bookings(salon_id,customer_id,style_id,guest_name,appointment_datetime,duration_hours)values('${realSid}','${demo}',gc_private.demo_record_id('${sid}','service',1),'sample',now()+interval '10 days',1);`,/DEMO_IDENTITY_BOUNDARY/);
 equal(run(`select public.claim_notification_delivery(gc_private.demo_record_id('${sid}','upcoming',0),'booking_confirmation','customer','email','client1@private-demo.invalid','sample-notification') is null;`),'t','delivery gate refuses sample even before provider');
 // Real confirmation, replay, stale preview and isolation for owner-requested archive.
 const archived=randomUUID(),archiveRequest=randomUUID(),staleRequest=randomUUID(),accessUser=randomUUID();
 run(`insert into public.stylists(id,salon_id,name,slug,is_active,is_draft)values('${archived}','${sid}','Sample archive professional','archive-professional',true,false);`);
 run(`insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)values('${accessUser}','archive-staff@private-demo.invalid','{"gc_demo":true}','{"role":"salon_staff"}');insert into public.salon_team_members(salon_id,user_id,stylist_id,email,name,status)values('${sid}','${accessUser}','${archived}','archive-staff@private-demo.invalid','Sample Archive Staff','Active');`);
 const futureProfessional=run(`select stylist_id from public.bookings where salon_id='${sid}' and appointment_datetime>now() and status='Confirmed' limit 1;`);
 denied(`select public.preview_gc_professional_archive('${sid}','${demo}','${futureProfessional}');`,/ASSISTANT_PROFESSIONAL_BOOKINGS_REMAIN/);
 denied(`select public.preview_gc_professional_archive('${sid}','${real}','${archived}');`,/ASSISTANT_ACCESS_DENIED/);
 denied(`select public.preview_gc_professional_archive('${realSid}','${real}','${archived}');`,/ASSISTANT_(RECORD_NOT_FOUND|PLAN_REQUIRED|ACCESS_DENIED)/);
 denied(`begin;set local role authenticated;select public.preview_gc_professional_archive('${sid}','${demo}','${archived}');rollback;`,/permission denied/);
 function archivePreview(id){run(`insert into public.gc_assistant_requests(id,salon_id,requested_by,locale,tool,arguments,execution_payload,risk_class,permission,digest,before_summary)
 select '${id}','${sid}','${demo}','en','prepare_professional_archive',jsonb_build_object('stylist_id','${archived}'),p->'payload',4,'stylists','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',p->'before'
 from (select public.preview_gc_professional_archive('${sid}','${demo}','${archived}') p) q;`);}
 archivePreview(staleRequest);
 run(`update public.stylists set name='Sample archive renamed' where id='${archived}';`);
 equal(JSON.parse(run(`select public.confirm_gc_assistant_request('${staleRequest}','${sid}','${demo}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');`)).code,'ASSISTANT_PREVIEW_STALE','changed profile requires a fresh review');
 equal(run(`select archived_at is null from public.stylists where id='${archived}';`),'t','failed review never changes the professional');
 archivePreview(archiveRequest);
 const archivedResult=JSON.parse(run(`select public.confirm_gc_assistant_request('${archiveRequest}','${sid}','${demo}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');`));
 equal(archivedResult.verified,true,'confirmed archive readback');
 equal(run(`select status from public.salon_team_members where salon_id='${sid}' and user_id='${accessUser}';`),'Inactive','linked staff access revoked');
 equal(JSON.parse(run(`select public.confirm_gc_assistant_request('${archiveRequest}','${sid}','${demo}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');`)).replayed,true,'same confirmation is idempotent');
 equal(run(`select count(*) from public.record_management_events where record_id='${archived}' and action='Archived';`),'1','single authoritative archive audit');
 equal(run(`select count(*) from public.bookings where salon_id='${sid}';`),String(expectedBookings),'archive does not remove bookings');
 // Reproduce the current Engine group arrangement on reset as well as the
 // historical clean-chain arrangement above. No public master name is required.
 run("insert into public.service_groups(category_id,name) select category_id,'Braids' from public.service_groups where name='Protective Styles' on conflict(category_id,name)do update set is_active=true,archived_at=null;insert into public.service_groups(category_id,name) select category_id,'Cornrows' from public.service_groups where name='Braids' and is_active on conflict(category_id,name)do update set is_active=true,archived_at=null;update public.service_groups set is_active=false,archived_at=now() where name='Protective Styles';");
 const groupCatalogBefore=run("select md5(jsonb_agg(to_jsonb(g) order by id)::text) from public.service_groups g;");
 const stamp=run(`select seeded_at from gc_private.demo_workspaces where salon_id='${sid}';`);
 denied(`select public.reset_private_demo('${realSid}','${real}',now(),'RESET PRIVATE DEMO');`,/DEMO_WORKSPACE_REQUIRED/);
 denied(`select public.reset_private_demo('${sid}','${demo}',now(),'RESET PRIVATE DEMO');`,/DEMO_RESET_CONFIRMATION_REQUIRED/);
 denied(`begin;set local role authenticated;select public.reset_private_demo('${sid}','${demo}','${stamp}','RESET PRIVATE DEMO');rollback;`,/permission denied/);
 const reset=JSON.parse(run(`select public.reset_private_demo('${sid}','${demo}','${stamp}','RESET PRIVATE DEMO');`));
 equal(reset.reconciled,true,'explicit reset reconciles atomically');equal(reset.bookings,expectedBookings,'reset does not double records');
 equal(run("select md5(jsonb_agg(to_jsonb(g) order by id)::text) from public.service_groups g;"),groupCatalogBefore,'reset preserves the Engine group catalog');
 equal(run("select md5(jsonb_agg(to_jsonb(m) order by id)::text) from public.master_styles m;"),catalogBefore,'reset never restores withdrawn public styles');
 equal(run(`select g.name from public.styles s join public.service_groups g on g.id=s.service_group_id where s.salon_id='${sid}' and s.name='Cornrows';`),'Cornrows','current specific group wins over the historical braiding fallback');
 equal(run('select row_to_json(m) from public.platform_admin_overview_metrics() m;'),before,'reset leaves real business and platform totals unchanged');
 equal(run(`select count(*) from auth.users where id='${demo}' and raw_app_meta_data->>'gc_demo'='true';`),'1','reset preserves owner login identity');
 denied(`select public.reset_private_demo('${sid}','${demo}','${stamp}','RESET PRIVATE DEMO');`,/DEMO_RESET_CONFIRMATION_REQUIRED/);
 console.log(run(`select jsonb_build_object('bookings',(select count(*) from public.bookings where salon_id='${sid}'),'clients',(select count(distinct customer_id) from public.bookings where salon_id='${sid}'),'completed_booking_value',(select sum(estimated_total) from public.bookings where salon_id='${sid}' and status='Completed'),'monthly_booking_values',(select jsonb_object_agg(report_month,total) from (select to_char(appointment_datetime at time zone 'America/New_York','YYYY-MM') as report_month,sum(estimated_total) total from public.bookings where salon_id='${sid}' and status='Completed' group by 1)m));`));
 console.log(`Master Build demo isolation: ${checks} checks passed against an isolated local ${process.env.MASTER_UPGRADE_AFTER?'upgrade':'current-schema clone'} database.`);
}finally{const removed=execute(control,`drop database ${clone} with(force);`);assert.equal(removed.status,0,removed.stderr);}
