import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd()),{validateTool}=load('src/lib/gcAssistantCore.ts');
const input=(section,changes)=>({section,changes_json:JSON.stringify(changes)});
const values={profile:{name:'Original Business Name',phone:'+12125550123',languages:['French']},notifications:{reviews:true,marketing:false},booking:{slot_minutes:15,buffer_minutes:30},location:{home_address_public:false,public_neighborhood:'Invented neighborhood',offers_mobile:true,travel_radius_miles:12,travel_fee_cents:1250},deposits:{rate:20,threshold_amount:null,threshold_rate:null,repeat_incident_count:null,repeat_incident_rate:null,incident_window_days:365},growth:{reminder_hours:[48,2],waitlist_service_ids:[],waitlist_professional_ids:[]},rebooking:{enabled:true,absence_days:60,minimum_visits:1,service_ids:[]}};
function fixture({owner=true,foreign=false,email=true,invalid=false}={}){
 const calls=[];const context={isOwner:owner,salon:{id:'business-A'},user:{id:'owner-A'},admin:{async rpc(name,p){calls.push({name,p});assert.equal(p.p_salon,'business-A');assert.equal(p.p_actor,'owner-A');const section=p.p_section||p.p_args.section;return {error:null,data:name.startsWith('read_')?{salon_id:foreign?'business-B':'business-A',section,values:values[section]}:{salon_id:foreign?'business-B':'business-A',before:{state:{revision:1,version:null}},payload:{section,values:invalid?{...values[section],rate:999}:values[section],changes:JSON.parse(p.p_args.changes_json)}}};}}};
 const helper=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/contentModerationServer':{async moderatePublicContent(){calls.push({name:'moderate-profile'});return {outcome:'allow'};}},'@/lib/businessCustomerCampaignServer':{async campaignEmailAvailable(){calls.push({name:'email-check'});return email;}}})('src/lib/assistantControlsServer.ts');
 return {calls,read:section=>helper.readAssistantControls(context,{section}),prepare:(section,changes)=>helper.prepareAssistantControls(context,input(section,changes))};
}
test('control action patches are strictly typed and cannot alter tenant, billing or confirmation authority',()=>{
 for(const [section,change]of Object.entries(values)){assert.equal(validateTool('prepare_business_controls',input(section,change)).risk,4);for(const field of ['salon_id','user_id','confirmed','reviewed','stripe_key','revision'])assert.throws(()=>validateTool('prepare_business_controls',input(section,{...change,[field]:'extra'})),/ASSISTANT_INVALID_INPUT/);}
 for(const [section,change]of [['deposits',{rate:'20'}],['growth',{reminder_hours:[1.5]}],['rebooking',{enabled:'true'}],['rebooking',{absence_days:29}],['deposits',{}]])assert.throws(()=>validateTool('prepare_business_controls',input(section,change)),/ASSISTANT_INVALID_INPUT/);
 assert.throws(()=>validateTool('prepare_business_controls',{section:'deposits',changes_json:'{'}),/ASSISTANT_INVALID_INPUT/);
});
test('all settings use complete canonical validation and review without calling any writer',async()=>{
 for(const section of Object.keys(values)){const f=fixture(),r=await f.prepare(section,values[section]);assert.equal(r.payload.section,section);assert.deepEqual(f.calls.map(c=>c.name),section==='rebooking'?['preview_gc_business_controls','email-check']:section==='profile'?['preview_gc_business_controls','moderate-profile']:['preview_gc_business_controls']);}
 const f=fixture({invalid:true});await assert.rejects(f.prepare('deposits',{rate:20}),/ASSISTANT_INVALID_INPUT/);
});
test('nonowners and another-business responses are rejected before facts or configuration reach the caller',async()=>{
 for(const method of ['read','prepare']){const f=fixture({owner:false});await assert.rejects(f[method]('deposits',{rate:20}),/ASSISTANT_ACCESS_DENIED/);assert.equal(f.calls.length,0);const other=fixture({foreign:true});await assert.rejects(other[method]('deposits',{rate:20}),/ASSISTANT_ACCESS_DENIED/);}
});
test('unavailable email blocks enablement, while readback reports the unavailable channel honestly',async()=>{
 const f=fixture({email:false});await assert.rejects(f.prepare('rebooking',{enabled:true}),/ASSISTANT_EMAIL_UNAVAILABLE/);const read=await f.read('rebooking');assert.equal(read.email_available,false);
});
test('settings proposal history is reauthorized before model replay after an owner role is lost',async()=>{
 const helper=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{}})('src/lib/assistantProfessionalScope.ts');let calls=0;
 await assert.rejects(helper.assertAssistantProposalScope({isOwner:false,admin:{rpc(){calls++;}}},'prepare_business_controls',input('deposits',{rate:20})),/ASSISTANT_ACCESS_DENIED/);assert.equal(calls,0);
 await assert.rejects(helper.assertAssistantProposalScope({isOwner:true,salon:{id:'A'},user:{id:'owner'},admin:{async rpc(){calls++;return {data:{salon_id:'B'}};}}},'prepare_business_controls',input('deposits',{rate:20})),/ASSISTANT_ACCESS_DENIED/);assert.equal(calls,1);
});

test('workspace settings preserve security and notification boundaries before RPC',()=>{
 for(const [section,change] of [['profile',{email:'other@example.test'}],['notifications',{email:false}],['booking',{slot_minutes:17}],['location',{address_street:'Unverified'}],['location',{travel_fee_cents:12.5}]])assert.throws(()=>validateTool('prepare_business_controls',input(section,change)),/ASSISTANT_INVALID_INPUT/);
});
