import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const owner='11000000-0000-4000-8000-000000000001',business='22000000-0000-4000-8000-000000000001',foreign='22000000-0000-4000-8000-000000000002';
const reference='55000000-0000-4000-8000-000000000001',origin='https://girlzculture.com';
const vars={GOOGLE_BUSINESS_PROFILE_ACTIVATION:'live',GOOGLE_BUSINESS_PROFILE_APPROVED:'true',GOOGLE_BUSINESS_PROFILE_VERIFIED_AT:'2026-01-01',GOOGLE_BUSINESS_PROFILE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET:'fixture-client-secret',GOOGLE_BUSINESS_PROFILE_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),GOOGLE_BUSINESS_PROFILE_REDIRECT_URI:origin+'/api/salon/integrations/google/callback'};
function setup(t,{enabled=true,isOwner=true}={}){
 const prior={...process.env},oldFetch=globalThis.fetch;
 for(const key of Object.keys(vars))delete process.env[key];if(enabled)Object.assign(process.env,vars);
 t.after(()=>{for(const key of Object.keys(vars)){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}globalThis.fetch=oldFetch;});
 const calls=[],queries=[],events=[],providerCalls=[],flows=new Map(),operations=new Map();
 let row=null,remote={name:'locations/1',title:'Our Salon',phoneNumbers:{primaryPhone:'+13055550123'},profile:{description:'Prior description'},websiteUri:'https://existing.example.test'},providerFailure=false;
 const salon={id:business,user_id:owner,name:'Our Salon',phone:'+13055550123',description:'Current description',gallery_photos:['https://example.test/our-photo.png']};
 const context={user:{id:owner},salon,isOwner};
 const admin={from(table){const query={select(){return query;},eq(key,value){queries.push({table,key,value});return query;},order(){return query;},limit:async()=>({data:[...operations.values()].filter(o=>o.salon_id===business)}),single:async()=>({data:salon}),maybeSingle:async()=>({data:row?structuredClone(row):null})};return query;},
 async rpc(name,args={}){
  calls.push({name,args});if(name==='google_business_owner')return {data:true};if(name==='due_business_google')return {data:row?.auto_sync?[structuredClone(row)]:[]};
  if(name==='consume_business_google_flow'){const f=flows.get(args.p_hash);flows.delete(args.p_hash);return {data:f||null};}
  assert.equal(name,'manage_business_google');assert.equal(args.p_salon,business);assert.equal(args.p_owner,owner);
  const a=args.p_args||{};
  switch(args.p_action){
   case 'flow':row||={salon_id:business,owner_id:owner,status:'disconnected',generation:1};flows.set(a.state_hash,{salon_id:business,owner_id:owner,generation:row.generation,verifier_secret:a.verifier_secret});break;
   case 'authorize':row={...row,status:'authorized',secret:a.secret,generation:row.generation+1};break;
   case 'connect':row={...row,status:'connected',account_name:a.account,location_name:a.location,remote_hash:a.remote_hash,local_hash:a.local_hash};break;
   case 'tokens':row.secret=a.secret;break;
   case 'claim':{const op=operations.get(a.id);if(op)return {data:{existing:true,status:op.status}};operations.set(a.id,{...a,salon_id:business,status:'running'});row.lease_id=a.id;return {data:{existing:false}};}
   case 'finish':Object.assign(operations.get(a.id),a);row={...row,lease_id:null,remote_hash:a.remote_hash||row.remote_hash,local_hash:a.local_hash||row.local_hash};break;
   case 'auto_sync':row.auto_sync=a.enabled;break;
   case 'check_failed':row.last_error=a.error_code;row.auto_sync=false;break;
   case 'disconnect':{const secret=row?.secret;row={...row,status:'disconnected',secret:null,auto_sync:false,generation:(row?.generation||0)+1};return {data:{secret}};}
   default:throw Error('unhandled fixture operation '+args.p_action);
  }return {data:{}};
 }};
 context.admin=admin;
 globalThis.fetch=async(url,init={})=>{
  providerCalls.push({url:String(url),method:init.method||'GET',body:init.body,headers:init.headers});
  if(providerFailure)return new Response('fixture secret-bearing error body',{status:403});
  if(String(url).endsWith('/token'))return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600});
  if(String(url).endsWith('/revoke'))return new Response('');
  assert.equal(init.headers.Authorization,'Bearer fixture-access');assert.equal(init.redirect,'error');
  if(String(url).includes('/accounts?'))return Response.json({accounts:[{name:'accounts/1'}]});
  if(String(url).includes('/accounts/1/locations?'))return Response.json({locations:[remote,{name:'locations/2',title:'Another Business',phoneNumbers:{primaryPhone:'+13055550888'}}]});
  if(String(url).includes('/v1/locations/1')){
   if(init.method==='PATCH')remote={...remote,...JSON.parse(init.body)};
   return Response.json(remote);
  }
  if(String(url).endsWith('/media'))return Response.json({name:'accounts/1/locations/1/media/1'});
  if(String(url).endsWith('/localPosts'))return Response.json({name:'accounts/1/locations/1/localPosts/1'});
  throw Error('Unexpected fixture provider URL');
 };
 const load=loadNodeTypescript(process.cwd(),{'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin,requireSalonOwner:async()=>context},'@/lib/requestSecurity':{enforceRateLimit:()=>{}},'@/lib/platformErrors':{capturePlatformError:async e=>{events.push(e);return reference;}},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler}});
 const server=load('src/lib/googleBusinessProfileServer.ts');
 const request=(body,path='/api/salon/integrations/google')=>new Request(origin+path,{method:body?'POST':'GET',headers:{authorization:'Bearer fixture-owner','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const send=async(body,path)=>{const response=await server.googleBusinessProfileRequest(request(body,path));return {status:response.status,data:await response.json(),headers:response.headers};};
 async function authorize(){
  const start=await send({action:'authorize'});assert.equal(start.status,200);
  const url=new URL(start.data.url),state=url.searchParams.get('state');
  const response=await server.googleBusinessCallback(new Request(vars.GOOGLE_BUSINESS_PROFILE_REDIRECT_URI+'?state='+state+'&code=fixture-code',{headers:{cookie:'__Host-gc-google-flow='+state}}));
  assert.equal(response.status,303);assert.ok(!row.secret.includes('fixture-refresh'));
  return {state,start,response};
 }
 async function connect(){await authorize();const choices=await send({action:'locations'});assert.deepEqual(choices.data.locations.map(x=>x.name),['locations/1']);assert.ok(!JSON.stringify(choices).includes('Another Business'));assert.equal((await send({action:'connect',account:'accounts/1',location:'locations/1'})).status,200);}
 return {server,send,authorize,connect,calls,queries,events,providerCalls,context,flows,operations,get row(){return row;},get remote(){return remote;},set providerFailure(v){providerFailure=v;}};
}
test('deferred mode cannot authorize or schedule; staff cannot access connection records',async t=>{
 const f=setup(t,{enabled:false});assert.deepEqual((await f.send()).data,{available:false,status:'deferred'});
 assert.equal((await f.send({action:'authorize'})).status,503);assert.deepEqual(await f.server.processGoogleBusinessProfiles(),{disabled:true,checked:0});
 assert.equal(f.calls.length,0);assert.equal(f.queries.length,0);assert.equal(f.providerCalls.length,0);
 f.context.isOwner=false;assert.equal((await f.send()).status,403);assert.equal(f.queries.length,0);
});
test('real route path with simulated Google handles OAuth, binds one business and blocks replay/injection',async t=>{
 const f=setup(t);const {state,start}=await f.authorize();assert.match(start.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
 const replay=await f.server.googleBusinessCallback(new Request(vars.GOOGLE_BUSINESS_PROFILE_REDIRECT_URI+'?state='+state+'&code=fixture-code',{headers:{cookie:'__Host-gc-google-flow='+state}}));
 assert.equal(replay.status,400);assert.equal(f.providerCalls.filter(x=>x.url.endsWith('/token')).length,1);
 assert.equal((await f.send({action:'connect',account:'accounts/1',location:'locations/2'})).status,403);
 for(const body of [{action:'locations',salon_id:foreign},{action:'preview',kind:'info',business_id:foreign}])assert.equal((await f.send(body)).status,400);
 assert.equal((await f.send(null,'/api/salon/integrations/google?salon_id='+foreign)).status,400);
 assert.equal(f.row.status,'authorized');assert.ok(f.events.every(e=>!JSON.stringify(e).includes('fixture-code')));
});
test('reviewed information is verified, external changes block writes, and completed intent cannot repeat',async t=>{
 const f=setup(t);await f.connect();
 const preview=await f.send({action:'preview',kind:'info'});
 const input={action:'sync',id:'66000000-0000-4000-8000-000000000001',kind:'info',review_hash:preview.data.review_hash};
 f.remote.profile.description='Changed in Google';
 assert.equal((await f.send(input)).status,409);assert.equal(f.providerCalls.filter(x=>x.method==='PATCH').length,0);
 input.review_hash=(await f.send({action:'preview',kind:'info'})).data.review_hash;
 assert.equal((await f.send(input)).data.status,'completed');assert.equal(f.remote.profile.description,'Current description');assert.equal(f.remote.websiteUri,'https://existing.example.test');
 // A refresh gets the new review hash; the same operation ID is still a no-op.
 input.review_hash=(await f.send({action:'preview',kind:'info'})).data.review_hash;
 assert.equal((await f.send(input)).data.repeated,true);assert.equal(f.providerCalls.filter(x=>x.method==='PATCH').length,1);
 assert.ok(f.queries.filter(x=>x.table==='business_google_connections'&&x.key==='salon_id').every(x=>x.value===business));
});
test('own media and reviewed posts use bound location; foreign images never reach Google',async t=>{
 const f=setup(t);await f.connect();
 assert.equal((await f.send({action:'preview',kind:'media',url:'https://example.test/other-business.png'})).status,400);
 for(const [kind,extra,id] of [['media',{url:'https://example.test/our-photo.png'},'66000000-0000-4000-8000-000000000002'],['post',{summary:'Our summer hours',locale:'en'},'66000000-0000-4000-8000-000000000003']]){
  const preview=await f.send({action:'preview',kind,...extra});assert.equal(preview.status,200);
  assert.equal((await f.send({action:'sync',kind,...extra,id,review_hash:preview.data.review_hash})).data.status,'completed');
 }
 assert.equal(f.providerCalls.filter(x=>x.method==='POST'&&/\/(media|localPosts)$/.test(x.url)).length,2);
 const disconnected=await f.send({action:'disconnect'});assert.deepEqual(disconnected.data,{status:'disconnected',revoked:true});assert.equal(f.row.secret,null);assert.equal(f.row.auto_sync,false);
 assert.equal((await f.send({action:'preview',kind:'info'})).status,409);
});
test('automatic updates rotate through database scheduler and stop on external conflicts',async t=>{
 const f=setup(t);await f.connect();await f.send({action:'auto_sync',enabled:true});f.context.salon.description='New local description';f.remote.profile.description='External Google edit';
 await f.server.processGoogleBusinessProfiles();assert.equal(f.row.auto_sync,false);assert.equal(f.row.last_error,'GOOGLE_REMOTE_CONFLICT');assert.equal(f.providerCalls.filter(x=>x.method==='PATCH').length,0);
});
test('provider failure uses exact protected incident without raw bodies, tokens or callback query',async t=>{
 const f=setup(t);await f.connect();f.providerFailure=true;
 const result=await f.send({action:'preview',kind:'info'});assert.equal(result.status,503);assert.equal(result.data.request_id,reference);assert.equal(result.headers.get('x-request-id'),reference);
 assert.equal(result.data.code,'GOOGLE_ACCESS_UNAVAILABLE');
 assert.ok(!JSON.stringify(f.events).includes('secret-bearing'));assert.ok(!JSON.stringify(f.events).includes('fixture-refresh'));
});
