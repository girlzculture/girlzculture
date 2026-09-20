import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNodeTypescript } from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const core=load('src/lib/businessCustomerCampaigns.ts');
const {CUSTOMER_CAMPAIGN_COPY_ROWS,campaignCopy}=load('src/i18n/business-customer-campaign-copy.ts');
const id=n=>`18100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const salon=id(1),owner=id(2),campaign=id(3),customer=id(4),post=id(5);
test('campaign input permits only bounded exact selections and explicit approval/send/cancel',()=>{
 assert.deepEqual(core.campaignAction({action:'save',id:campaign,post_id:post,post_revision:2,customer_ids:[customer]}),{action:'save',id:campaign,post_id:post,post_revision:2,customer_ids:[customer]});
 for(const body of [{action:'send',id:campaign},{action:'cancel',id:campaign,confirm:false},{action:'save',id:campaign,post_id:post,post_revision:2,customer_ids:[customer,customer]},{action:'save',id:campaign,post_id:post,post_revision:2,customer_ids:[]},{action:'send',id:campaign,confirm:true,salon_id:id(99)},{action:'confirm',id:campaign,revision:1,reviewed_locales:['xx'],confirm:true},{action:'save',id:campaign,post_id:post,post_revision:2,customer_ids:Array.from({length:21},(_,i)=>id(100+i))}])assert.throws(()=>core.campaignAction(body));
 assert.equal(core.campaignAction({action:'confirm',id:campaign,revision:1,reviewed_locales:['fr','es'],confirm:true}).action,'confirm');
});
test('email copy escapes user prose and links while retaining reviewed content and opt-out',()=>{
 const html=load('src/lib/businessCustomerCampaignEmail.ts').campaignHtml({title:'<Title>',body:'A & B\nSecond line'},'https://fixture.invalid/book?a=1&b=2','https://fixture.invalid/unsubscribe?t=abc',{book:'Book',unsubscribe:'Unsubscribe',reason:'Opted in'});
 assert.match(html,/&lt;Title&gt;/);assert.match(html,/A &amp; B<br>Second line/);assert.match(html,/book\?a=1&amp;b=2/);assert.match(html,/unsubscribe\?t=abc/);assert.doesNotMatch(html,/<Title>/);
});
test('campaign dictionary has complete nonempty four-locale copy and placeholder parity',()=>{
 assert.equal(new Set(CUSTOMER_CAMPAIGN_COPY_ROWS.map(row=>row[0])).size,CUSTOMER_CAMPAIGN_COPY_ROWS.length);
 for(const row of CUSTOMER_CAMPAIGN_COPY_ROWS){assert.equal(row.length,4);for(const value of row){assert.ok(value.trim());assert.deepEqual(value.match(/\{[^}]+\}/g)||[],row[0].match(/\{[^}]+\}/g)||[]);}}
 for(const locale of ['fr','es','zh-CN'])for(const source of ['Accepted by email provider','Cancelled before sending'])assert.notEqual(campaignCopy(locale,source),source);
});
function harness({provider=async()=>({id:'email-fixture'}),claimOverride,available=true,finishFailure=false,isOwner=true,omitReadback=false}={}){
 const calls=[],sends=[],incidents=[];let reserved=false;
 const claim={attempt_id:id(6),customer_id:customer,preference_id:id(7),destination:'client@example.test',locale:'fr',copy:{title:'Titre vérifié',body:'Contenu vérifié'},booking_path:'/salon/fixture-own/book',business_name:'Own business'};
 const workspace={clients:[],clients_capped:false,posts:[],campaigns:[],channel:'email'};
 const admin={from(table){assert.equal(table,'engine_settings');return {select(){return this;},eq(key,value){assert.equal(key,'setting_key');assert.equal(value,'notifications.channels');return this;},async maybeSingle(){return {data:{published_value:available?['email']:[]}};}};},async rpc(name,args){calls.push({name,args});assert.equal(args.p_salon,salon);if(args.p_actor)assert.equal(args.p_actor,owner);
  if(name==='claim_customer_campaign_email'){if(reserved)return {data:null};reserved=true;return {data:claimOverride===undefined?claim:claimOverride};}
  if(name==='finish_customer_campaign_email'&&finishFailure)return {error:Error('private database failure')};
  if(name==='save_customer_campaign')workspace.campaigns=[{id:campaign,revision:1,status:'draft',recipients:[{id:customer}]}];
  if(name==='confirm_customer_campaign'){workspace.campaigns[0].status='confirmed';workspace.campaigns[0].revision++;}
  if(name==='cancel_customer_campaign')workspace.campaigns[0].status='cancelled';
  return {data:name==='customer_campaign_workspace'?(omitReadback?{...workspace,campaigns:[]}:workspace):campaign};
 }};
 const overrides={'@/lib/supabaseAdmin':{requireSalonPermission:async()=>({admin,salon:{id:salon},user:{id:owner},isOwner}),sendEmail:async(...args)=>{sends.push(args);return provider(...args);}},'@/lib/businessCommunicationServer':{communicationUnsubscribeToken:value=>`${value}.fixture-capability`},'@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler},'@/lib/platformErrors':{capturePlatformError:async input=>{incidents.push(input);return id(99);},safeFailure:(message,reference,status,extra)=>Response.json({error:message,request_id:reference,...extra},{status})}};
 const loaded=loadNodeTypescript(process.cwd(),overrides);
 return {server:loaded('src/lib/businessCustomerCampaignServer.ts'),route:loaded('src/app/api/salon/customer-campaigns/route.ts'),context:{admin,salonId:salon,actorId:owner},calls,sends,incidents,workspace};
}
test('real server reserves before transport, uses saved locale/destination and finishes canonical readback',async()=>{
 const previous=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY='synthetic-only';
 try{const f=harness();await f.server.sendNextCustomerCampaignEmail(f.context,campaign);assert.deepEqual(f.calls.map(c=>c.name),['claim_customer_campaign_email','finish_customer_campaign_email']);assert.equal(f.calls[1].args.p_status,'accepted');assert.equal(f.sends.length,1);const [to,title,html,category,options]=f.sends[0];assert.equal(to,'client@example.test');assert.equal(title,'Titre vérifié');assert.match(html,/Se désabonner/);assert.match(html,/fixture-capability/);assert.equal(category,'account');assert.ok(options.signal);assert.equal(options.idempotencyKey,`business-campaign:${campaign}:${customer}:email`);await f.server.sendNextCustomerCampaignEmail(f.context,campaign);assert.equal(f.sends.length,1);}finally{if(previous===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=previous;}
});
test('timeout, rejected provider, skipped transport and missing receipt stay uncertain and cannot retry',async()=>{
 const previous=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY='synthetic-only';
 try{for(const provider of [async()=>{throw Error('AbortError private address');},async()=>({skipped:true}),async()=>({})]){const f=harness({provider});await f.server.sendNextCustomerCampaignEmail(f.context,campaign);assert.equal(f.calls.at(-1).args.p_status,'uncertain');assert.equal(f.calls.at(-1).args.p_reference,id(99));assert.equal(f.incidents[0].error.message,'CAMPAIGN_OUTCOME_UNCERTAIN_NO_RETRY');assert.doesNotMatch(JSON.stringify(f.incidents),/client@example|private address|Contenu/);await f.server.sendNextCustomerCampaignEmail(f.context,campaign);assert.equal(f.sends.length,1);}}finally{if(previous===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=previous;}
});
test('disabled channel, fresh skip and malformed claim never call the email provider',async()=>{
 const previous=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY='synthetic-only';
 try{const disabled=harness({available:false});await assert.rejects(disabled.server.sendNextCustomerCampaignEmail(disabled.context,campaign),/CAMPAIGN_EMAIL_UNAVAILABLE/);assert.equal(disabled.calls.length,0);assert.equal(disabled.sends.length,0);for(const claimOverride of [null,{skipped:true},{attempt_id:id(6),customer_id:customer,preference_id:id(7),locale:'fr',destination:'private\naddress'}]){const f=harness({claimOverride});await f.server.sendNextCustomerCampaignEmail(f.context,campaign);assert.equal(f.sends.length,0);}}finally{if(previous===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=previous;}
});
test('finish write uncertainty cannot cause a second provider call on repeated request',async()=>{
 const previous=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY='synthetic-only';
 try{const f=harness({finishFailure:true});await assert.rejects(f.server.sendNextCustomerCampaignEmail(f.context,campaign));await f.server.sendNextCustomerCampaignEmail(f.context,campaign);assert.equal(f.sends.length,1);}finally{if(previous===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=previous;}
});
test('route staff denial and crafted foreign scope cannot access records or transport',async()=>{
 const staff=harness({isOwner:false});assert.equal((await staff.route.GET(new Request('https://fixture.invalid'))).status,403);assert.equal(staff.calls.length,0);
 const foreign=harness();assert.equal((await foreign.route.POST(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({action:'send',id:campaign,confirm:true,salon_id:id(10)})}))).status,400);assert.equal(foreign.calls.length,0);assert.equal(foreign.sends.length,0);
});
test('save and confirmation never send; every owner mutation returns a fresh scoped workspace',async()=>{
 const f=harness();for(const body of [{action:'save',id:campaign,post_id:post,post_revision:2,customer_ids:[customer]},{action:'confirm',id:campaign,revision:1,reviewed_locales:['fr'],confirm:true},{action:'cancel',id:campaign,confirm:true}]){const response=await f.route.POST(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify(body)}));assert.equal(response.status,200);assert.equal((await response.json()).verified,true);assert.equal(f.calls.at(-1).name,'customer_campaign_workspace');}assert.equal(f.sends.length,0);
});
test('mutation without its actual affected-record readback is never reported as verified success',async()=>{
 const f=harness({omitReadback:true});const response=await f.route.POST(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({action:'save',id:campaign,post_id:post,post_revision:2,customer_ids:[customer]})}));assert.equal(response.status,500);const result=await response.json();assert.equal(result.request_id,id(99));assert.equal(result.verified,undefined);assert.equal(f.sends.length,0);
});
