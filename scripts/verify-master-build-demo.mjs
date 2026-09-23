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
assert.match(source.pathname,/^\/girlzculture_[a-z_0-9]+(?:release|clean)$/);
for(const name of ['seed-private-demo.sql','check-private-demo.sql','reset-private-demo.sql'])assert.ok(readFileSync('supabase/migrations/20260923064718_master_build_demo_workspace.sql','utf8').includes(readFileSync('supabase/demo/'+name,'utf8')),'Reviewed migration and canonical demo procedure diverged: '+name);
const psql=process.env.PSQL_BIN||'psql',clone='girlzculture_master_demo_'+randomUUID().replaceAll('-','');
const control=new URL(source);control.pathname='/postgres';const target=new URL(source);target.pathname='/'+clone;
function execute(url,sql){return spawnSync(psql,[url.toString(),'-X','-qAt','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});}
function run(sql){const r=execute(target,sql);assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
let checks=0;function equal(a,b,label){assert.equal(a,b,label);checks++;}
function denied(sql,pattern){const r=execute(target,sql);assert.notEqual(r.status,0,'Expected a denied database operation');assert.match(r.stderr,pattern);checks++;}
const created=execute(control,`create database ${clone} template ${source.pathname.slice(1)};`);assert.equal(created.status,0,created.stderr);
try{
 const after=process.env.MASTER_UPGRADE_AFTER;
 if(after)for(const name of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')&&n.slice(0,14)>after).sort())run(readFileSync('supabase/migrations/'+name,'utf8'));
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
 run(readFileSync('supabase/demo/seed-private-demo.sql','utf8'));
 run(readFileSync('supabase/demo/check-private-demo.sql','utf8'));
 const expectedBookings=Number(run("select 476+least(28,2*(extract(day from current_date)::integer-1))+13+(case when extract(day from current_date)>2 then 1 else 0 end)+8;"));
 const seeded=JSON.parse(run(`select public.seed_private_demo('${sid}','${demo}',current_date);`));
 equal(seeded.bookings,expectedBookings,'fourteen months of connected bookings');
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
 equal(check.counts.products,4,'retail products');equal(check.counts.clients,28,'private client cards');equal(check.counts.messages,16,'sample conversations');
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
 equal(summary.completed_product_sales_cents,109200,'four products over fourteen months reconcile');
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
 run(readFileSync('supabase/demo/reset-private-demo.sql','utf8'));
 const stamp=run(`select seeded_at from gc_private.demo_workspaces where salon_id='${sid}';`);
 denied(`select public.reset_private_demo('${realSid}','${real}',now(),'RESET PRIVATE DEMO');`,/DEMO_WORKSPACE_REQUIRED/);
 denied(`select public.reset_private_demo('${sid}','${demo}',now(),'RESET PRIVATE DEMO');`,/DEMO_RESET_CONFIRMATION_REQUIRED/);
 denied(`begin;set local role authenticated;select public.reset_private_demo('${sid}','${demo}','${stamp}','RESET PRIVATE DEMO');rollback;`,/permission denied/);
 const reset=JSON.parse(run(`select public.reset_private_demo('${sid}','${demo}','${stamp}','RESET PRIVATE DEMO');`));
 equal(reset.reconciled,true,'explicit reset reconciles atomically');equal(reset.bookings,expectedBookings,'reset does not double records');
 equal(run('select row_to_json(m) from public.platform_admin_overview_metrics() m;'),before,'reset leaves real business and platform totals unchanged');
 equal(run(`select count(*) from auth.users where id='${demo}' and raw_app_meta_data->>'gc_demo'='true';`),'1','reset preserves owner login identity');
 denied(`select public.reset_private_demo('${sid}','${demo}','${stamp}','RESET PRIVATE DEMO');`,/DEMO_RESET_CONFIRMATION_REQUIRED/);
 console.log(`Master Build demo isolation: ${checks} checks passed against an isolated local upgrade database.`);
}finally{const removed=execute(control,`drop database ${clone} with(force);`);assert.equal(removed.status,0,removed.stderr);}
