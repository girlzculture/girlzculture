import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

// Run only on a disposable local database. Never seed genuine tenants.
const source = new URL(process.env.CLEAN_DATABASE_URL || '');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(source.hostname));
assert.match(source.pathname,/^\/girlzculture_[a-z_]+(?:release|clean)$/);
const psql=process.env.PSQL_BIN || 'psql';
const clone=`girlzculture_master_plan_${randomUUID().replaceAll('-','')}`;
const control=new URL(source); control.pathname='/postgres';
const target=new URL(source);target.pathname='/'+clone;
function run(url, sql) { const r=spawnSync(psql,[url.toString(),'-X','-qAt','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim(); }
const sql=s=>run(target,s);
const id=()=>randomUUID();
run(control,`create database ${clone} template ${source.pathname.slice(1)};`);
let checks=0;
function verify(actual,expected,label){assert.equal(actual,expected,label);checks++;}
try {
 const owner=id(),other=id(),a=id(),b=id(),service=id(),p1=id(),p2=id(),member=id();
 sql(`begin;
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('${owner}','${owner}@example.test','',now(),'{"role":"salon_owner"}'),('${other}','${other}@example.test','',now(),'{"role":"salon_owner"}'),('${member}','${member}@example.test','',now(),'{"role":"salon_staff"}');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_tier,subscription_status) values
 ('${a}','${owner}','Master fixture A','master-${a}','${owner}@example.test','Active','Solo','active'),
 ('${b}','${other}','Master fixture B','master-${b}','${other}@example.test','Active','Starter','active');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max)
 select '${service}','${a}',id,'Master service',1,1,100,100,100 from public.service_groups where is_active and archived_at is null order by sort_order,name limit 1;
 insert into public.stylists(id,salon_id,name,slug,is_active,is_draft) values ('${p1}','${a}','Master professional one','master-${p1}',true,false),('${p2}','${a}','Master professional two','master-${p2}',true,false);
 commit;`);
 for(const [tier,key,products,promotions,team] of [['Solo','solo',10,1,false],['Solo Pro','solo-pro',30,3,false],['Starter','starter',10,1,true],['Growth','growth',30,5,true],['Premium','premium',null,null,true]]){
  sql(`update public.salons set subscription_tier='${tier}' where id='${a}';`);
  verify(sql(`select public.salon_effective_plan_key('${a}');`),key,`${tier} plan`);
  verify(sql(`select coalesce(public.salon_plan_limit('${a}','product_listings')::text,'unlimited');`),products===null?'unlimited':String(products),`${tier} products`);
  verify(sql(`select coalesce(public.salon_plan_limit('${a}','customer_promotions')::text,'unlimited');`),promotions===null?'unlimited':String(promotions),`${tier} promotions`);
  verify(sql(`select public.salon_has_feature('${a}','unlimited_stylist_profiles');`),team?'t':'f',`${tier} team`);
  for(const feature of ['gc_assistant','finances','client_cards'])verify(sql(`select public.salon_has_feature('${a}','${feature}');`),'t',`${tier} ${feature}`);
 }
 sql(`update public.salons set subscription_tier='Solo' where id='${a}';`);
 verify(sql(`select public.p0_actor_has_permission('${a}','${owner}','bookings'),public.p0_actor_has_permission('${a}','${owner}','stylists'),public.p0_actor_has_permission('${b}','${owner}','bookings');`),'t|f|f','owner core allowed, team and foreign business denied');
 const denied=spawnSync(psql,[target.toString(),'-X','-qAt','-v','ON_ERROR_STOP=1'],{input:`insert into public.salon_team_members(salon_id,user_id,email,name,status,permissions) values('${a}','${member}','${member}@example.test','Master member','Active','{"bookings":true}');`,encoding:'utf8'});
 assert.notEqual(denied.status,0);assert.match(denied.stderr,/SOLO_TEAM_PLAN_REQUIRED/);checks++;
 // Two real concurrent sessions, different professional IDs, exact same slot.
 function booking(professional,day){return new Promise((resolve,reject)=>{
  const child=spawn(psql,[target.toString(),'-X','-qAt','-v','ON_ERROR_STOP=1']);let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));
  child.stdin.end(`begin;set local lock_timeout='15s';insert into public.bookings(salon_id,style_id,stylist_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,guest_name,guest_email) values('${a}','${service}','${professional}',date_trunc('day',now())+interval '${day} days 15 hours',1,100,10,90,'Paid','Confirmed','Sample Guest','guest-${professional}@example.test');commit;`);
 });}
 for(const [tier,day,expected] of [['Solo',100,1],['Solo Pro',101,1],['Starter',102,2]]){
  sql(`update public.salons set subscription_tier='${tier}' where id='${a}';`);
  const result=await Promise.all([booking(p1,day),booking(p2,day)]);
  verify(result.filter(r=>r.code===0).length,expected,`${tier} concurrent slot outcomes: ${JSON.stringify(result)}`);
  for(const failure of result.filter(r=>r.code!==0))assert.match(failure.err,/BOOKING_RESOURCE_CONFLICT/);
  verify(sql(`select count(*) from public.bookings where salon_id='${a}' and appointment_datetime=date_trunc('day',now())+interval '${day} days 15 hours';`),String(expected),`${tier} authoritative slot count`);
 }
 sql(`insert into public.subscriptions(salon_id,tier,status,scheduled_tier) values('${a}','Growth','active','Solo Pro');`);
 verify(sql(`select public.salon_plan_limit('${a}','customer_promotions');`),'3','scheduled Solo Pro constrains Growth promotions');
 console.log(`Master Build plans: ${checks} database checks passed; concurrent Solo/Solo Pro collisions rejected, team slots independent. No external providers called.`);
} finally {run(control,`drop database ${clone};`);}

