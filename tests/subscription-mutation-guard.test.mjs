import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
import {typescriptLoader} from './helpers/load-typescript.mjs';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function fixture(){
 const calls=[],state={busy:false,valid:true,uncertain:false};
 const admin={rpc:async(name,args)=>{calls.push({rpc:name,args});return state.busy&&name==='acquire_subscription_mutation'?{error:{message:'SUBSCRIPTION_MUTATION_BUSY'}}:{data:name==='record_subscription_mutation_request'?state.valid:true};}};
 const stripe={stripeFailureDiagnostics:error=>error.diagnostics,stripeGet:async(path,options)=>{calls.push({get:path,signal:options.signal,apiVersion:options.apiVersion});return state.drift&&calls.some(c=>c.post)?{changed:true}:{};},stripeRequest:async(path,values,options)=>{calls.push({post:path,values,signal:options.signal});if(state.uncertain)throw Error('UNCERTAIN');if(state.rejection)throw state.rejection;return{};}};
 const api=loadNodeTypescript(process.cwd(),{'@/lib/stripeServer':stripe,'@/lib/platformErrors':{UserSafeRequestError:class extends Error{constructor(message,status){super(message);this.status=status;}}}})('src/lib/subscriptionMutationGuard.ts');
 const run=callback=>api.withSubscriptionMutation({admin,salonId:'own-business',actorId:'own-user',subscriptionId:'sub_own'},callback);
 return{calls,state,run};
}
test('active payment setup stops plan and lifecycle callbacks before any provider access',async()=>{
 const f=fixture();f.state.busy=true;let entered=false;await assert.rejects(()=>f.run(async()=>{entered=true;}),error=>error.status===409);assert.equal(entered,false);assert.equal(f.calls.length,1);
});
test('one provider deadline and durable lease protect every lifecycle write and release on success',async()=>{
 const f=fixture();await f.run(async provider=>{await provider.get('/subscriptions/sub_own');await provider.post('/subscriptions/sub_own',{cancel_at_period_end:true});await provider.post('/subscription_schedules/sub_sched_own/release',{});});
 assert.deepEqual(f.calls.filter(c=>c.rpc).map(c=>c.rpc),['acquire_subscription_mutation','record_subscription_mutation_request','record_subscription_mutation_response','record_subscription_mutation_request','record_subscription_mutation_response','release_subscription_mutation']);
 const requests=f.calls.filter(c=>c.get||c.post);assert.equal(new Set(requests.map(c=>c.signal)).size,1);assert.ok(requests.every(c=>c.signal instanceof AbortSignal));
 assert.ok(f.calls.filter(c=>c.rpc).every(c=>c.args.p_lease===f.calls[0].args.p_lease));
});
test('uncertain write keeps the durable lease instead of releasing it early',async()=>{
 const f=fixture();f.state.uncertain=true;await assert.rejects(()=>f.run(provider=>provider.post('/subscriptions/sub_own',{cancel_at_period_end:true})),/UNCERTAIN/);assert.equal(f.calls.some(c=>c.rpc==='release_subscription_mutation'),false);
});
test('ownership or expired lease denies the provider mutation',async()=>{
 const f=fixture();f.state.valid=false;await assert.rejects(()=>f.run(provider=>provider.post('/subscriptions/sub_own',{cancel_at_period_end:true})),/LEASE_LOST/);assert.equal(f.calls.some(c=>c.post),false);
});
test('validation before provider writes releases the lease',async()=>{const f=fixture();await assert.rejects(()=>f.run(async()=>{throw Error('VALIDATION');}),/VALIDATION/);assert.equal(f.calls.some(c=>c.rpc==='release_subscription_mutation'),true);});
test('guard forwards the exact read API version while retaining its own bounded signal',async()=>{const f=fixture(),caller=new AbortController().signal;await f.run(provider=>provider.get('/subscription_schedules/sub_sched_own',{apiVersion:'2025-06-30.basil',signal:caller}));const read=f.calls.find(c=>c.get);assert.equal(read.apiVersion,'2025-06-30.basil');assert.ok(read.signal instanceof AbortSignal);assert.notEqual(read.signal,caller);});
test('failed read-only invoice preview releases the lease without marking a provider mutation',async()=>{
 const f=fixture();f.state.uncertain=true;await assert.rejects(()=>f.run(provider=>provider.post('/invoices/create_preview',{subscription:'sub_own'})),/UNCERTAIN/);
 assert.equal(f.calls.some(c=>c.rpc==='release_subscription_mutation'),true);assert.equal(f.calls.some(c=>c.rpc==='record_subscription_mutation_request'),false);
});
for(const status of [402,409,500])test(`provider HTTP${status} retains uncertainty hold`,async()=>{
 const f=fixture();f.state.rejection=Object.assign(Error('REJECTED'),{provider:'stripe',status,deliveryUncertain:false});await assert.rejects(()=>f.run(provider=>provider.post('/subscriptions/sub_own',{})),/REJECTED/);assert.equal(f.calls.some(c=>c.rpc==='release_subscription_mutation'),false);
});
for(const drift of [false,true])test(`explicit parameter rejection releases only after unchanged authoritative baseline, drift=${drift}`,async()=>{
 const f=fixture();f.state.drift=drift;f.state.rejection=Object.assign(Error('REJECTED'),{provider:'stripe',status:400,deliveryUncertain:false,diagnostics:{provider_type:'invalid_request_error',provider_code:'parameter_unknown'}});
 await assert.rejects(()=>f.run(async provider=>{await provider.get('/subscriptions/sub_own');await provider.post('/subscriptions/sub_own',{bad_parameter:true});}),/REJECTED/);
 assert.equal(f.calls.some(c=>c.rpc==='release_subscription_mutation'),!drift);assert.equal(f.calls.filter(c=>c.get).length,2);
});

for(const kind of ['lifecycle','change'])test(`${kind} route returns an exact protected incident reference for an uncertain prior mutation`,async()=>{
 const observed=[];const admin={from(){const query={select(){return query;},eq(){return query;},maybeSingle:async()=>({data:{stripe_subscription_id:'sub_own'}})};return query;}};
 const monitored={routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_profile,handler)=>handler,noteOperationalFailure:()=>{}};
 const safe={UserSafeRequestError:class extends Error{},capturePlatformError:async event=>{observed.push(event);return'BILLING-GUARD-EXACT';},safeFailure:(message,reference,status,extra)=>Response.json({error:message,request_id:reference,...extra},{status,headers:{'X-Request-ID':reference}})};
 const route=loadNodeTypescript(process.cwd(),{
  '@/lib/operationalMonitoring':monitored,'@/lib/supabaseAdmin':{requireSalonOwner:async()=>({admin,salon:{id:'own-business'},user:{id:'own-user'},isOwner:true})},
  '@/lib/subscriptionMutationGuard':{withSubscriptionMutation:async()=>{throw Object.assign(Error('SUBSCRIPTION_MUTATION_REVIEW_REQUIRED'),{code:'SUBSCRIPTION_MUTATION_REVIEW_REQUIRED'});}},
  '@/lib/subscriptionPriceServer':{verifiedSubscriptionPrice:async()=>({priceId:'price_approved'})},
  '@/lib/platformErrors':safe,
 }) (`src/app/api/stripe/subscription/${kind}/route.ts`);
 const response=await route.POST(new Request('https://fixture.invalid/api/stripe/subscription/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(kind==='change'?{plan:'Growth'}:{action:'reactivate'})}));
 assert.equal(response.status,409);assert.equal(response.headers.get('x-request-id'),'BILLING-GUARD-EXACT');const result=await response.json();assert.equal(result.request_id,'BILLING-GUARD-EXACT');assert.equal(result.code,'SUBSCRIPTION_MUTATION_REVIEW_REQUIRED');assert.match(result.error,/Billing support must reconcile/);assert.equal(observed.length,1);assert.equal(observed[0].salonId,'own-business');assert.equal(observed[0].actorId,'own-user');
});

function lifecycleFixture({staleResponse=false,failedReadback=false,schedule=false,failedRelease=false,initiallyCancelled=false}={}){
 const actual={id:'sub_fixture',status:'active',cancel_at_period_end:initiallyCancelled,current_period_start:1700000000,current_period_end:1800000000,schedule:schedule?'sub_sched_fixture':null,items:{data:[]}};
 const stored={stripe_subscription_id:actual.id,...(schedule?{stripe_schedule_id:'sub_sched_fixture',scheduled_tier:'Growth'}:{})};
 const posts=[],writes=[],intents=[],cache=new Map();let leased=false,written=false,lease=null;
 const providerSchedule={id:'sub_sched_fixture',subscription:actual.id,status:'active',released_subscription:null};
 const admin={async rpc(name,args){
  if(name==='acquire_subscription_mutation'){if(leased)return{error:{message:'SUBSCRIPTION_MUTATION_REVIEW_REQUIRED'}};leased=true;lease=args.p_lease;return{data:true};}
  assert.equal(args.p_lease,lease);if(name==='record_subscription_mutation_request')intents.push(structuredClone(args.p_intent));
  if(name==='release_subscription_mutation')leased=false;return{data:true};
 },from(){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:stored}),update(value){writes.push(value);Object.assign(stored,value);return q;},then(resolve){return Promise.resolve({error:null}).then(resolve);}};return q;}};
 const load=loadNodeTypescript(process.cwd(),{
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_p,h)=>h,noteOperationalFailure:()=>{}},
  '@/lib/requestSecurity':{cleanText:value=>value,enforceRateLimit:()=>{},errorResponse:err=>Response.json({error:err.message},{status:500})},
  '@/lib/supabaseAdmin':{requireSalonOwner:async()=>({admin,salon:{id:'business_fixture'},user:{id:'owner_fixture'},isOwner:true})},
  '@/lib/platformErrors':{UserSafeRequestError:class extends Error{},capturePlatformError:async()=> 'LIFECYCLE-READBACK',safeFailure:(message,reference,status,extra)=>Response.json({error:message,request_id:reference,...extra},{status})},
  '@/lib/stripeServer':{stripeFailureDiagnostics:()=>null,stripeGet:async path=>{
   if(written&&failedReadback)throw Error('READBACK_UNAVAILABLE');
   return structuredClone(path.startsWith('/subscription_schedules/')?providerSchedule:actual);
  },stripeRequest:async(path,values,options)=>{
   posts.push({path,values,key:options.idempotencyKey});written=true;
   if(cache.has(options.idempotencyKey))return structuredClone(cache.get(options.idempotencyKey));
   let response;
   if(path.endsWith('/release')){
    if(!failedRelease){actual.schedule=null;if(!values.preserve_cancel_date)actual.cancel_at_period_end=false;providerSchedule.status='released';providerSchedule.subscription=null;providerSchedule.released_subscription=actual.id;}
    response={...providerSchedule,status:'released'};
   }else{
    if(!staleResponse)actual.cancel_at_period_end=values.cancel_at_period_end;
    response={...actual,cancel_at_period_end:values.cancel_at_period_end};
   }
   cache.set(options.idempotencyKey,structuredClone(response));return response;
  }},
 });
 const route=load('src/app/api/stripe/subscription/lifecycle/route.ts');
 return{actual,stored,posts,writes,intents,isHeld:()=>leased,request:action=>route.POST(new Request('https://fixture.invalid/api/stripe/subscription/lifecycle',{method:'POST',body:JSON.stringify({action})}))};
}
test('lifecycle repeated cancellation and reactivation have distinct durable intent keys in the same billing period',async()=>{
 const f=lifecycleFixture();
 for(const action of ['cancel_at_period_end','reactivate','cancel_at_period_end','reactivate']){
  const response=await f.request(action);assert.equal(response.status,200);const result=await response.json();const expected=action==='cancel_at_period_end';
  assert.equal(f.actual.cancel_at_period_end,expected,'provider must change for this intent, not replay an earlier opposite generation');
  assert.equal(result.cancelAtPeriodEnd,expected);assert.equal(f.stored.cancel_at_period_end,expected);assert.equal(f.isHeld(),false);
 }
 assert.equal(new Set(f.posts.map(row=>row.key)).size,4);
 assert.deepEqual(f.posts.map(row=>row.key),f.intents.map(row=>row.idempotency_key));
});
for(const failure of ['staleResponse','failedReadback'])test(`lifecycle ${failure} never claims or stores an unverified cancellation`,async()=>{
 const f=lifecycleFixture({[failure]:true});const response=await f.request('cancel_at_period_end');
 assert.equal(response.status,409);const body=await response.json();assert.equal(body.code,'SUBSCRIPTION_MUTATION_REVIEW_REQUIRED');assert.equal(body.request_id,'LIFECYCLE-READBACK');
 assert.deepEqual(f.writes,[]);assert.equal(f.isHeld(),true);assert.equal(f.posts.length,1);
 const again=await f.request('cancel_at_period_end');assert.equal(again.status,409);assert.equal(f.posts.length,1,'uncertain intent must not start a fresh generation');
});
test('lifecycle verifies schedule release before clearing the saved scheduled plan',async()=>{
 const f=lifecycleFixture({schedule:true,failedRelease:true});const response=await f.request('cancel_scheduled_change');
 assert.equal(response.status,409);assert.deepEqual(f.writes,[]);assert.equal(f.stored.scheduled_tier,'Growth');assert.equal(f.isHeld(),true);
});
test('lifecycle confirmed release clears only the scheduled plan and preserves an existing cancellation',async()=>{
 const f=lifecycleFixture({schedule:true,initiallyCancelled:true});const response=await f.request('cancel_scheduled_change');
 assert.equal(response.status,200);assert.equal(f.actual.cancel_at_period_end,true);assert.equal(f.actual.schedule,null);assert.equal(f.stored.scheduled_tier,null);assert.equal(f.isHeld(),false);
 assert.equal(f.posts[0].values.preserve_cancel_date,true);const body=await response.json();assert.equal(body.cancelAtPeriodEnd,true);assert.doesNotMatch(body.message,/renew as usual/);
});
test('lifecycle cancellation verifies release and cancellation before its single local save',async()=>{
 const f=lifecycleFixture({schedule:true});const response=await f.request('cancel_at_period_end');assert.equal(response.status,200);
 assert.equal(f.actual.cancel_at_period_end,true);assert.equal(f.actual.schedule,null);assert.equal(f.writes.length,1);assert.equal(f.posts.length,2);assert.equal(new Set(f.posts.map(row=>row.key)).size,2);assert.equal(f.isHeld(),false);
});
test('lifecycle refuses stale reactivation readback without clearing the saved cancellation',async()=>{
 const f=lifecycleFixture({initiallyCancelled:true,staleResponse:true});const response=await f.request('reactivate');assert.equal(response.status,409);assert.equal(f.actual.cancel_at_period_end,true);assert.equal(f.writes.length,0);assert.equal(f.isHeld(),true);
});
test('actual subscription action preserves the protected reference for the existing toast helper',async()=>{
 const raw=readFileSync('src/components/owner/OwnerDashboardApp.tsx','utf8'),source=ts.createSourceFile('OwnerDashboardApp.tsx',raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let action;
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='action'&&node.parameters.length===3)action=node;ts.forEachChild(node,visit);};visit(source);assert.ok(action);
 const compiled=ts.transpileModule(`export ${action.getText(source)}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const reference='17800000-0000-4000-8000-000000000091',message='The earlier subscription update has an uncertain result. Billing support must reconcile it before another change; no further change was sent.';let notice='';const sandbox={exports:{},supabase:{auth:{getSession:async()=>({data:{session:{access_token:'fixture-only'}}})}},fetch:async()=>Response.json({error:message,request_id:reference},{status:409}),setBusy:()=>{},c:{setNotice:value=>{notice=value;}}};
 runInNewContext(compiled,sandbox);await sandbox.exports.action('/api/stripe/subscription/lifecycle','reactivate',{action:'reactivate'});
 const helpers=loadNodeTypescript(process.cwd())('src/lib/actionToastCore.ts');assert.equal(helpers.actionToastReference(notice),reference);assert.equal(helpers.actionToastMessage(notice),message);assert.equal(helpers.actionToastIsError(notice),true);
});
test('new lifecycle and scheduled-payment interface messages resolve in every supported locale with placeholders intact',()=>{
 const load=typescriptLoader(process.cwd()),{SUBSCRIPTION_PAYMENT_SOURCE_MESSAGES:messages}=load('src/components/owner/subscriptionPaymentMessages.ts'),{DASHBOARD_SOURCE_MESSAGES:catalogs}=load('src/i18n/dashboard-source-catalog.ts'),{resolveSourceTranslation}=load('src/lib/localizationCore.ts');
 const sources=['The earlier subscription update has an uncertain result. Billing support must reconcile it before another change; no further change was sent.','A billing update is already in progress. Finish or cancel the payment-method setup before changing the subscription.','The scheduled downgrade was cancelled. Your existing subscription cancellation remains scheduled.','The scheduled downgrade was cancelled. Your current plan will renew as usual.','The earlier payment update is too old to retry safely. Billing support must review the current payment method.','This subscription has a scheduled plan change. Its payment method needs billing support review so the scheduled plan remains unchanged.'];
 const placeholders=value=>[...value.matchAll(/\{[A-Za-z0-9_]+\}/g)].map(row=>row[0]).sort();
 for(const locale of ['fr','es','zh-CN']){
  assert.deepEqual(Object.keys(messages[locale]).sort(),Object.keys(messages.fr).sort());
  for(const source of sources){assert.ok(messages[locale][source]?.trim());assert.notEqual(messages[locale][source],source);assert.equal(resolveSourceTranslation(source,{},catalogs[locale]),messages[locale][source]);assert.deepEqual(placeholders(messages[locale][source]),placeholders(source));}
 }
});
