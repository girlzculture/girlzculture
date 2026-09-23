import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

// Representative upgrade on a disposable local database. No source database
// is trusted merely because its directory or database name says "188".
const control=new URL(process.env.CLEAN_DATABASE_URL||'');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(control.hostname));
control.pathname='/postgres';
const name='girlzculture_master_upgrade_'+randomUUID().replaceAll('-','');
const target=new URL(control);target.pathname='/'+name;
const psql=process.env.PSQL_BIN||'psql';
function execute(url,input){const r=spawnSync(psql,[url.toString(),'-X','-qAt','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
const sql=input=>execute(target,input);
const files=readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort();
const baseline=files.filter(n=>n.slice(0,14)<='20260919181855');
const pending=files.filter(n=>n.slice(0,14)>'20260919181855');
assert.equal(baseline.length,188,'Use the complete reviewed baseline, including Instagram');
execute(control,`create database ${name};`);
try{
 sql(readFileSync('scripts/sql/supabase-platform-prerequisites.sql','utf8'));
 for(const file of baseline)sql(readFileSync('supabase/migrations/'+file,'utf8'));
 console.log('Complete 188-migration baseline applied.');
 const actor=randomUUID(),salon=randomUUID(),service=randomUUID(),booking=randomUUID(),expense=randomUUID();
 sql(`insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)
 values('${actor}','upgrade-owner@example.test','',now(),'{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,time_zone)
 values('${salon}','${actor}','Upgrade fixture','upgrade-${salon}','upgrade-owner@example.test','Active','active','Premium','UTC');
 insert into public.subscriptions(salon_id,tier,status)values('${salon}','Premium','active');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,is_draft)
 select '${service}','${salon}',id,'Recorded service',1,1,100,false from public.service_groups limit 1;
 insert into public.bookings(id,salon_id,style_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,guest_name)
 values('${booking}','${salon}','${service}',now()-interval '3 days',1,100,0,100,'Not paid','Completed','Upgrade sample client');
 insert into public.business_finance_expenses(id,salon_id,occurred_at,category,amount_cents,treatment,created_by)
 values('${expense}','${salon}',now()-interval '4 days','Supplies',5000,'operating','${actor}');`);
 const evidence=()=>JSON.parse(sql(`select public.read_service_contribution_evidence('${salon}','${actor}',current_date-28,current_date-1);`));
 const before=evidence();
 const statusBefore=sql(`select status from public.salons where id='${salon}';`);
 const payload={from:before.period.from,to:before.period.to,service_id:service,revision:0,fingerprint:before.fingerprint,complete:true,zero_confirmed:false,allocations:[{kind:'expense',id:expense,cents:3000}],note:'Representative previously reviewed recorded cost'};
 sql(`select public.save_service_contribution_review('${salon}','${actor}','${randomUUID()}','${JSON.stringify(payload)}');`);
 const bookingBefore=sql(`select to_jsonb(b)::text from public.bookings b where id='${booking}';`);
 const expenseBefore=sql(`select to_jsonb(e)::text from public.business_finance_expenses e where id='${expense}';`);
 for(const file of pending)sql(readFileSync('supabase/migrations/'+file,'utf8'));
 const after=evidence();
 assert.equal(after.fingerprint,before.fingerprint,'Demo metadata must not invalidate genuine cost reviews');
 assert.equal(after.reviews[0].fingerprint,before.fingerprint);
 assert.equal(after.reviews[0].revision,1);
 assert.equal(after.finance.is_demo,false);
 assert.equal(sql(`select (to_jsonb(b)-'is_demo'-'service_location_snapshot')::text from public.bookings b where id='${booking}';`),bookingBefore,'Existing booking terms unchanged');
 assert.equal(sql(`select service_location_snapshot is null from public.bookings where id='${booking}';`),'t','No invented destination on historical bookings');
 assert.equal(sql(`select (to_jsonb(e)-'is_demo')::text from public.business_finance_expenses e where id='${expense}';`),expenseBefore,'Existing expense unchanged');
 assert.equal(sql(`select count(*) from gc_private.demo_workspaces;`),'0','Migration does not provision invented data');
 assert.equal(sql(`select tier from public.subscriptions where salon_id='${salon}';`),'Premium','Existing subscription not changed');
 assert.equal(sql(`select status from public.salons where id='${salon}';`),statusBefore,'Existing business lifecycle unchanged');
 // Existing independently maintained assertions cover financial permissions,
 // immutable booking terms, reviewed writes, replay, and provider isolation.
 for(const file of ['verify-business-service-contribution.sql','verify-business-deposits.sql','verify-business-inventory.sql','verify-business-reviews.sql','verify-business-client-cards.sql','verify-google-business-profile.sql','verify-master-booking-reports.sql','verify-master-rebooking-reminders.sql','verify-master-google-help.sql','verify-master-advertising.sql','verify-master-assistant-operations.sql','verify-master-solo-upgrade.sql','verify-master-assistant-catalog.sql','verify-master-assistant-controls.sql','verify-master-assistant-team.sql','verify-master-assistant-fulfillment.sql']){
  sql(readFileSync('scripts/sql/'+file,'utf8'));console.log(file+': PASS');
 }
 console.log(`Master Build representative upgrade: 188 + ${pending.length} migrations; 10 preservation checks and 16 SQL suites passed.`);
}finally{execute(control,`drop database ${name} with(force);`);}
