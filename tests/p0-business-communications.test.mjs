import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const bookingId='10000000-0000-4000-8000-000000000001';
const customerId='10000000-0000-4000-8000-000000000002';
const preferenceId='10000000-0000-4000-8000-000000000003';
const choices={email_enabled:true,sms_enabled:false,push_enabled:true,reminders:true,follow_up:false,marketing:false,locale:'es',consent_version:1};
const input=()=>({request_id:randomUUID(),expected_revision:0,choices:{...choices}});
const normalize=value=>JSON.parse(JSON.stringify(value));
const core=typescriptLoader(process.cwd())('src/lib/businessCommunicationCore.ts');

test('communication update accepts exact choices and rejects role, business or consent injection',()=>{
 const body=input();assert.deepEqual(normalize(core.communicationUpdate(body)),{requestId:body.request_id,revision:0,choices});
 for(const mutate of [b=>b.customer_id=customerId,b=>b.choices.salon_id=bookingId,b=>b.choices.marketing='true',b=>b.choices.consent_version=2,b=>b.choices.locale='wo',b=>b.expected_revision=-1,b=>b.request_id='invalid']){
  const bad=input();mutate(bad);assert.throws(()=>core.communicationUpdate(bad),/COMMUNICATION_INVALID/);
 }
});

function routeFixture({identity,authError=false,guest=null,rpcError=null,limited=false}={}){
 const calls=[],events=[];
 class RateLimitError extends Error{retryAfter=17;}
 const admin={auth:{getUser:async()=>({data:{user:authError?null:{id:customerId,email:'customer@example.test'}},error:authError?Error('private provider detail'):null})},
  from:table=>{assert.equal(table,'platform_identities');const q={select:()=>q,eq:(key,value)=>{assert.equal(key,'user_id');assert.equal(value,customerId);return q;},maybeSingle:async()=>({data:identity??{primary_role:'customer',status:'Active',email_normalized:'customer@example.test'},error:null})};return q;},
  rpc:async(name,args)=>{calls.push({name,args});return {data:{...choices,scope:'business',revision:1},error:rpcError};}};
 const load=typescriptLoader(process.cwd(),{
  '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin},
  '@/lib/guestBookingAccess':{verifyGuestBookingToken:async()=>guest},
  '@/lib/requestSecurity':{RateLimitError,enforceRateLimit:()=>{if(limited)throw new RateLimitError();}},
  '@/lib/platformErrors':{capturePlatformError:async event=>{events.push(event);return '20000000-0000-4000-8000-000000000001';}},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_profile,handler)=>handler},
 });
 const route=load('src/app/api/customer/bookings/[id]/communications/route.ts');
 return {calls,events,request:async({method='GET',body,headers={Authorization:'Bearer fixture-only'}}={})=>route[method](new Request(`https://example.test/api/customer/bookings/${bookingId}/communications`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),{params:Promise.resolve({id:bookingId})})};
}
test('preferences route derives the customer identity server-side and forwards revision plus retry ID',async()=>{
 const f=routeFixture();const body=input();const response=await f.request({method:'PUT',body});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 assert.deepEqual(normalize(f.calls[0]),{name:'manage_business_communication_preferences',args:{p_booking:bookingId,p_customer:customerId,p_guest_token:null,p_update:choices,p_expected:0,p_request:body.request_id}});
});
test('unauthenticated, disabled and owner identities cannot reach consent mutation',async()=>{
 for(const options of [{authError:true},{identity:{primary_role:'salon_owner',status:'Active',email_normalized:'customer@example.test'}},{identity:{primary_role:'customer',status:'Disabled',email_normalized:'customer@example.test'}},{identity:{primary_role:'customer',status:'Active',email_normalized:'other@example.test'}}]){
  const f=routeFixture(options);const response=await f.request({method:'PUT',body:input()});assert.ok([401,403].includes(response.status));assert.equal(f.calls.length,0);assert.equal((await response.json()).request_id,response.headers.get('x-request-id'));
 }
});
test('guest capability targets exactly its verified booking and never supplies a customer identity',async()=>{
 const tokenId=randomUUID();const f=routeFixture({guest:{bookingId,tokenId}});assert.equal((await f.request({headers:{'x-guest-booking-token':'synthetic-capability'}})).status,200);assert.equal(f.calls[0].args.p_guest_token,tokenId);assert.equal(f.calls[0].args.p_customer,null);
 for(const guest of [null,{bookingId:randomUUID(),tokenId}]){const denied=routeFixture({guest});assert.equal((await denied.request({headers:{'x-guest-booking-token':'synthetic-capability'}})).status,401);assert.equal(denied.calls.length,0);}
});
test('stale changes and transport failures retain exact references without private SQL or provider text',async()=>{
 for(const [message,status,code] of [['COMMUNICATION_STALE',409,'COMMUNICATION_STALE'],['private database error containing sensitive data',500,'COMMUNICATION_UNAVAILABLE']]){
  const f=routeFixture({rpcError:{message}});const response=await f.request({method:'PUT',body:input()});assert.equal(response.status,status);const body=await response.json();assert.equal(body.code,code);assert.equal(body.request_id,response.headers.get('x-request-id'));assert.equal(JSON.stringify(body).includes('private database'),false);
 }
});
test('rate-limited consent requests return JSON 429 with retry guidance and do not reach storage',async()=>{
 const f=routeFixture({limited:true});const response=await f.request();assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'17');assert.equal((await response.json()).code,'COMMUNICATION_RATE_LIMIT');assert.equal(f.calls.length,0);
});
test('opt-out capability is signed, tamper-resistant and domain-separated from booking access',()=>{
 const server=typescriptLoader(process.cwd(),{}, {process:{env:{GUEST_BOOKING_LINK_SECRET:'synthetic-signing-secret-at-least-32-characters'}}})('src/lib/businessCommunicationServer.ts');
 const token=server.communicationUnsubscribeToken(preferenceId);assert.equal(server.verifyCommunicationUnsubscribeToken(token),preferenceId);
 for(const bad of [token.replace(preferenceId,customerId),token+'x',preferenceId,null,'x'.repeat(500)])assert.equal(server.verifyCommunicationUnsubscribeToken(bad),null);
 assert.equal(token.includes('Bearer'),false);
});
test('preference retrieval constrains both guest and customer queries to the booked business',async()=>{
 const server=typescriptLoader(process.cwd())('src/lib/businessCommunicationServer.ts');const queries=[];
 const admin={from:table=>{assert.equal(table,'business_communication_preferences');const where={};const q={select:()=>q,eq:(key,value)=>{where[key]=value;return q;},maybeSingle:async()=>{queries.push(where);return {data:where.guest_booking_id?{...choices,locale:'fr'}:{...choices,locale:'es'},error:null};}};return q;}};
 const result=await server.bookingCommunicationPreferences(admin,{id:bookingId,salon_id:'only-business-a',customer_id:customerId});assert.equal(result.locale,'fr');assert.deepEqual(queries,[{salon_id:'only-business-a',guest_booking_id:bookingId},{salon_id:'only-business-a',customer_id:customerId}]);
});

function uiHarness(){
 const slots=[];let cursor=0,effects=[],tree,dirty=true,authCallback;let session=null;let sessionWait=null;
 const requests=[],responses=[];const actor={id:customerId};
 const react={useRef:value=>{const index=cursor++;return slots[index]??={current:value};},useState:initial=>{const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{const next=typeof value==='function'?value(slots[index]):value;if(next!==slots[index]){slots[index]=next;dirty=true;}}];},useEffect:(effect,deps)=>{const index=cursor++;const old=slots[index];if(!old||deps.some((v,i)=>v!==old.deps[i])){slots[index]={deps};effects.push(()=>{old?.cleanup?.();slots[index].cleanup=effect();});}}};
 const Component=typescriptLoader(process.cwd(),{react,'@/components/i18n/LocaleProvider':{useI18n:()=>({translateSource:value=>value})},'@/lib/supabase':{getSessionForScope:async()=>sessionWait?sessionWait.promise:session,getSupabaseForScope:()=>({auth:{onAuthStateChange:callback=>{authCallback=callback;return {data:{subscription:{unsubscribe(){}}}};}}})}},{crypto:{randomUUID},fetch:async(url,options)=>{requests.push({url,...options});return new Promise(resolve=>responses.push(resolve));}})('src/components/booking/CommunicationPreferences.tsx').CommunicationPreferencesState;
 const render=()=>{do{dirty=false;cursor=0;tree=Component({bookingId});const pending=effects;effects=[];pending.forEach(effect=>effect());}while(dirty);return tree;};
 const find=predicate=>{const walk=node=>{if(!node||typeof node!=='object')return null;if(Array.isArray(node))return node.map(walk).find(Boolean);return predicate(node)?node:walk(node.props?.children);};return walk(render());};
 const authenticate=(id=actor.id)=>{session=id?{user:{id},access_token:'synthetic-only'}:null;authCallback('SIGNED_IN',session);render();};
 const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));render();};
 render();return {render,find,requests,responses,authenticate,tick,holdSession(){let resolve;const promise=new Promise(done=>resolve=done);sessionWait={promise};return resolve;},async ready(){authenticate();find(n=>n.type==='button'&&n.props.children==='Communication preferences').props.onClick();await tick();responses[0](Response.json({preferences:{...choices,revision:1,scope:'business'}}));await tick();}};
}
test('communication editor waits for initial authentication and rejects a delayed old-account response',async()=>{
 const ui=uiHarness();assert.equal(ui.find(n=>n.type==='button').props.disabled,true);await ui.ready();assert.equal(ui.find(n=>n.type==='select').props.value,'es');
 ui.find(n=>n.type==='button'&&n.props.children==='Reload preferences').props.onClick();await ui.tick();ui.authenticate(randomUUID());ui.responses[1](Response.json({preferences:{...choices,locale:'zh-CN',revision:4,scope:'business'}}));await ui.tick();assert.equal(ui.find(n=>n.type==='select'),undefined);assert.equal(ui.find(n=>n.type==='button').props['aria-expanded'],false);
});
test('a consent save awaiting session refresh cannot run under the next account credentials',async()=>{
 const ui=uiHarness();await ui.ready();const resolve=ui.holdSession();ui.find(n=>n.type==='button'&&n.props.children==='Save communication preferences').props.onClick();const next=randomUUID();ui.authenticate(next);resolve({user:{id:next},access_token:'another-synthetic-token'});await ui.tick();assert.equal(ui.requests.filter(r=>r.method==='PUT').length,0);
});
test('failed communication save retains choices, exact incident and stable request ID for retry',async()=>{
 const ui=uiHarness();await ui.ready();ui.find(n=>n.type==='select').props.onChange({target:{value:'fr'}});ui.find(n=>n.type==='button'&&n.props.children==='Save communication preferences').props.onClick();await ui.tick();const request=JSON.parse(ui.requests[1].body);const reference=randomUUID();ui.responses[1](Response.json({code:'COMMUNICATION_UNAVAILABLE',request_id:reference},{status:500}));await ui.tick();assert.equal(ui.find(n=>n.type==='select').props.value,'fr');assert.ok(ui.find(n=>n.props.role==='alert').props.children.includes(reference));ui.find(n=>n.type==='button'&&n.props.children==='Save communication preferences').props.onClick();await ui.tick();assert.equal(JSON.parse(ui.requests[2].body).request_id,request.request_id);ui.responses[2](Response.json({preferences:{...choices,locale:'fr',revision:2,scope:'business'}}));await ui.tick();assert.equal(ui.find(n=>n.props.role==='status').props.children,'Communication preferences saved.');
});
