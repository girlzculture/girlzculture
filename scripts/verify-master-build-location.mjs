import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {loadNodeTypescript} from '../tests/helpers/load-node-typescript.mjs';
const source=new URL(process.env.CLEAN_DATABASE_URL||'');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(source.hostname));
assert.match(source.pathname,/^\/girlzculture_[a-z_0-9]+(?:release|clean)$/);
const psql=process.env.PSQL_BIN||'psql', clone='girlzculture_master_location_'+randomUUID().replaceAll('-','');
const control=new URL(source);control.pathname='/postgres';const target=new URL(source);target.pathname='/'+clone;
function execute(url,sql){return spawnSync(psql,[url.toString(),'-X','-qAt','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});}
function run(sql){const r=execute(target,sql);assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function denied(sql,pattern){const r=execute(target,sql);assert.notEqual(r.status,0,'Expected a denied database operation');assert.match(r.stderr,pattern);checks++;}
const created=execute(control,`create database ${clone} template ${source.pathname.slice(1)};`);assert.equal(created.status,0,created.stderr);
const quote=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const core=loadNodeTypescript(process.cwd())('src/lib/applicationProgress.ts');
let checks=0;
function equal(actual,expected,label){assert.equal(actual,expected,label);checks++;}
try{
 // Optional representative upgrade: apply only files newer than the fixture's recorded baseline.
 const after=process.env.MASTER_UPGRADE_AFTER;
 if(after)for(const name of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')&&n.slice(0,14)>after).sort())run(readFileSync('supabase/migrations/'+name,'utf8'));
 const owner=randomUUID(),other=randomUUID(),reviewer=randomUUID(),customer=randomUUID(),stranger=randomUUID();
 run(`insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values('${owner}','${owner}@example.test','',now(),'{"role":"salon_owner"}'),('${other}','${other}@example.test','',now(),'{"role":"salon_owner"}'),('${reviewer}','${reviewer}@example.test','',now(),'{"role":"admin"}');
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)values('${customer}','${customer}@example.test','',now(),'{"role":"customer"}'),('${stranger}','${stranger}@example.test','',now(),'{"role":"customer"}');
 insert into public.admin_users(id,user_id,name,email,status,is_super_admin,permissions)values('${reviewer}','${reviewer}','Fixture reviewer','${reviewer}@example.test','Active',true,'{"submissions":true}');`);
 const fields={...core.INITIAL_APPLICATION_FIELDS,business_name:'Private fixture business',owner_name:'Fictional Owner',business_email:owner+'@example.test',phone:'+12125550123',street_address:'123 Fictional Home Street',city:'Brooklyn',state:'NY',zip_code:'11201',operator_type:'solo',location_type:'home',public_neighborhood:'Brooklyn',services_offered:'Braids',price_range:'$100-$200',insurance:'no',years_in_operation:'1',stylist_count:'1'};
 const payload={fields,documents:[],plan:'Solo',locale:'fr',step:6,entry_mode:'form'};
 const saved=JSON.parse(run(`select public.save_business_application_progress('${owner}',null,${quote(payload)});`));
 equal(saved.revision,1,'first draft revision');
 equal(JSON.parse(run(`select public.save_business_application_progress('${owner}',1,${quote(payload)});`)).revision,1,'identical save is idempotent');
 denied(`select public.save_business_application_progress('${owner}',null,${quote(payload)});`,/APPLICATION_DRAFT_STALE/);
 equal(run(`begin;set local role authenticated;set local request.jwt.claim.sub='${other}';select count(*) from public.business_application_progress;rollback;`),'0','foreign draft RLS');
 const app={...fields,selected_plan:'Solo',business_setup_type:'solo_professional',document_urls:[],photo_urls:[],reviewed_fields:fields};
 const salon={name:fields.business_name,slug:'private-'+owner,owner_name:fields.owner_name,email:fields.business_email,phone:fields.phone,address_street:fields.street_address,address_city:fields.city,address_state:fields.state,address_zip:fields.zip_code,business_type:'Hair Salon'};
 const details=core.validateApplicationDetails(fields,'Solo');
 const submit=(revision=1,values=app)=>`select public.submit_master_business_application('${owner}',${revision},${quote(salon)},${quote(values)},${quote(details)});`;
 denied(submit(2),/APPLICATION_DRAFT_STALE/);
 denied(submit(1,{...app,reviewed_fields:{...fields,street_address:'Changed without review'}}),/APPLICATION_REVIEW_CHANGED/);
 const result=JSON.parse(run(submit())),id=result.salon.id;
 equal(result.salon.address_street,null,'no public home street');equal(result.salon.address_zip,null,'no public home ZIP');
 equal(result.application.street_address,fields.street_address,'private application keeps verification street');
 equal(result.application.application_details.operator_type,'solo','operator persisted');
 equal(run(`select submitted_application_id from public.business_application_progress where user_id='${owner}';`),result.application.id,'single pipeline references submitted application');
 equal(run(`select address_street from public.business_verification_locations where salon_id='${id}';`),fields.street_address,'private address readback');
 denied(`set role anon;select * from public.business_verification_locations;`,/permission denied/);
 denied(`set role authenticated;select * from public.business_verification_locations;`,/permission denied/);
 denied(`set role authenticated;select public.submit_master_business_application('${other}',1,'{}','{}','{}');`,/permission denied/);
 denied(`update public.salons set approved_at=now(),status='Approved' where id='${id}';`,/IN_PERSON_VERIFICATION_REQUIRED/);
 denied(`update public.salon_applications set status='Approved' where id='${result.application.id}';`,/IN_PERSON_VERIFICATION_REQUIRED/);
 denied(`select public.record_business_location_visit('${id}','${owner}','verified',now(),'Fictional verification visit');`,/APPLICATION_REVIEW_FORBIDDEN/);
 const address={address_street:fields.street_address,address_line2:null,address_city:fields.city,address_state:fields.state,address_zip:fields.zip_code};
 const geocode={latitude:40.68,longitude:-73.99,formatted_address:'123 Fictional Home Street, Brooklyn',address_fingerprint:'fixture',geocode_status:'success',geocode_failure_reason:null,market_id:null,borough:'Brooklyn'};
 denied(`select public.commit_business_location_geocode('${id}',${quote({...address,address_street:'stale'})},${quote(geocode)});`,/VERIFICATION_ADDRESS_CHANGED/);
 run(`select public.commit_business_location_geocode('${id}',${quote(address)},${quote(geocode)});`);
 equal(run(`select (latitude is null and longitude is null and formatted_address is null and address_street is null)::text from public.salons where id='${id}';`),'true','geocoding cannot disclose private coordinates/street');
 equal(run(`select latitude from public.business_verification_locations where salon_id='${id}';`),'40.68','precise coordinates retained privately');
 denied(`select public.record_business_location_visit('${id}','${reviewer}','verified',now()+interval '1 day','Fictional verification visit');`,/VERIFICATION_VISIT_EVIDENCE_REQUIRED/);
 run(`select public.record_business_location_visit('${id}','${reviewer}','verified',now()-interval '1 day','Fixture visit completed in local database only');`);
 equal(run(`select count(*) from public.business_location_verification_events where salon_id='${id}';`),'1','immutable audit event created');
 run(`update public.salons set approved_at=now(),status='Approved' where id='${id}';`);
 equal(run(`select status from public.salons where id='${id}';`),'Approved','manual visit allows approval');
 denied(submit(),/APPLICATION_ALREADY_APPROVED/);
 run(`insert into public.customers(id,name,email)values('${customer}','Fictional customer','${customer}@example.test'),('${stranger}','Fictional other customer','${stranger}@example.test');`);
 const service=randomUUID(),booking=randomUUID();
 run(`insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max)
 select '${service}','${id}',id,'Private booking fixture',1,1,100,100,100 from public.service_groups where is_active and archived_at is null limit 1;
 insert into public.bookings(id,customer_id,salon_id,style_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status) values('${booking}','${customer}','${id}','${service}',now()+interval '100 days',1,100,10,90,'Unpaid','Pending');`);
 const location=()=>JSON.parse(run(`select public.confirmed_business_booking_location('${booking}','${customer}',null);`));
 equal(location().address_street,null,'pending customer cannot see private address');
 denied(`select public.confirmed_business_booking_location('${booking}','${stranger}',null);`,/BOOKING_LOCATION_FORBIDDEN/);
 denied(`select public.confirmed_business_booking_location('${booking}','${owner}',null);`,/BOOKING_LOCATION_FORBIDDEN/);
 run(`update public.bookings set status='Confirmed',deposit_status='Paid' where id='${booking}';`);
 equal(location().address_street,fields.street_address,'confirmed customer sees appointment address');
 equal(location().revealed_after_confirmation,true,'private disclosure clearly identified');
 run(`update public.bookings set status='Cancelled' where id='${booking}';`);
 equal(location().address_street,null,'cancelled booking loses private address access');
 const guest=randomUUID();
 run(`insert into public.booking_guest_access_tokens(id,booking_id,token_hash,purpose,expires_at)values('${guest}','${booking}','${randomUUID()}','manage',now()+interval '1 day');`);
 equal(JSON.parse(run(`select public.confirmed_business_booking_location('${booking}',null,'${guest}');`)).address_street,null,'cancelled guest cannot see private address');
 run(`update public.bookings set status='Confirmed' where id='${booking}';`);
 equal(JSON.parse(run(`select public.confirmed_business_booking_location('${booking}',null,'${guest}');`)).address_street,fields.street_address,'valid confirmed guest receives address');
 run(`update public.booking_guest_access_tokens set revoked_at=now() where id='${guest}';`);
 denied(`select public.confirmed_business_booking_location('${booking}',null,'${guest}');`,/BOOKING_LOCATION_FORBIDDEN/);

 const settings={home_address_public:true,public_neighborhood:'Brooklyn',offers_mobile:true,travel_radius_miles:12.5,travel_fee_cents:1250};
 denied(`select public.update_business_location_settings('${id}','${other}',1,${quote(settings)});`,/LOCATION_OWNER_REQUIRED/);
 denied(`set role authenticated;select public.update_business_location_settings('${id}','${owner}',1,${quote(settings)});`,/permission denied/);
 const locationSaved=JSON.parse(run(`select public.update_business_location_settings('${id}','${owner}',1,${quote(settings)});`));
 equal(locationSaved.revision,2,'owner settings CAS advances');equal(locationSaved.travel_fee_cents,1250,'travel fee cents persist');
 equal(run(`select address_street from public.salons where id='${id}';`),fields.street_address,'explicit home-address opt-in projects verified address');
 equal(run(`select latitude from public.salons where id='${id}';`),'40.68','public address opt-in projects verified coordinates');
 denied(`select public.update_business_location_settings('${id}','${owner}',1,${quote(settings)});`,/LOCATION_SETTINGS_STALE/);
 run(`select public.update_business_location_settings('${id}','${owner}',2,${quote({...settings,home_address_public:false})});`);
 equal(run(`select (address_street is null and latitude is null and longitude is null)::text from public.salons where id='${id}';`),'true','privacy opt-out redacts address and coordinates in same transaction');
 equal(JSON.parse(run(`select public.business_location_settings('${id}');`)).revision,3,'authoritative readback returns exact saved revision');
 denied(`select public.update_business_location_settings('${id}','${owner}',3,${quote({...settings,travel_radius_miles:101})});`,/LOCATION_TRAVEL_INVALID/);
 denied(`select public.update_business_location_settings('${id}','${owner}',3,${quote({...settings,travel_fee_cents:12.5})});`,/LOCATION_TRAVEL_INVALID/);
 denied(`select public.update_business_location_settings('${id}','${owner}',3,${quote({...settings,home_address_public:false,public_neighborhood:''})});`,/LOCATION_NEIGHBORHOOD_REQUIRED/);
 const lifecycle=JSON.parse(run(`select public.salon_lifecycle_diagnostic('${id}');`));
 equal(lifecycle.checks.structured_address.passed,true,'private verified address meets onboarding requirement without disclosure');
 equal(lifecycle.checks.precise_geocoding.passed,true,'private verified coordinates meet onboarding requirement');
 equal(JSON.stringify(lifecycle).includes(fields.street_address),false,'onboarding diagnostic never returns private street');
 equal(run(`select count(*) from public.business_location_settings_events where salon_id='${id}';`),'2','only successful changes append audit evidence');
 denied(`set role anon;select * from public.business_location_settings_events;`,/permission denied/);

 console.log(`Master application/location: ${checks} checks passed; private draft, stale review, RLS, address projection, geocoding race and real-visit approval guard. Disposable data only.`);
}finally{const r=execute(control,`drop database ${clone};`);assert.equal(r.status,0,r.stderr);}
