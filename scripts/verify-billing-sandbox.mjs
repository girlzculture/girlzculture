// Protected manual sandbox verification. No provider call occurs until
// configuration, exact commit and test-key gates pass.
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { localDatabase,localAdmin,sqlLiteral as literal } from './billing-sandbox-local.mjs';
import { configuration,requireSafe,assertAssociation,assertNoFanout,assertCreate,identity,digest,safeSummary,SandboxFailure } from './billing-sandbox-guards.mjs';

const root=process.cwd();
const report={kind:'sandbox-provider-verification',status:'FAIL',providerCalls:0,providerPosts:0,checks:[],recoveryRequired:false};
const output=resolve(root,'billing-sandbox-evidence');
const record=()=>{mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');};
const checked=name=>{report.checks.push(name);record();};
async function main() {
  const config=configuration(process.env);
  const checkout=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
  requireSafe(checkout.status===0&&checkout.stdout.trim()===process.env.BILLING_SANDBOX_APPROVED_SHA,'CHECKED_OUT_COMMIT_MISMATCH');
  report.sha=checkout.stdout.trim();report.mode=config.mode;checked('manual_exact_commit_and_test_key');
  let verified=false;let createdCount=0;let expiryCount=0;
  const created=new Map();
  const readonlyIds=new Set();

  async function provider(method,path,values={},options={}) {
    requireSafe(typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//')&&!path.includes('#'),'PROVIDER_PATH_REJECTED');
    const url=new URL(`https://api.stripe.com/v1${path}`);
    requireSafe(url.origin==='https://api.stripe.com'&&url.pathname.startsWith('/v1/'),'PROVIDER_ORIGIN_REJECTED');
    if(method==='GET') {
      const allowed=new Set(['/v1/account',`/v1/customers/${config.customer}`,`/v1/subscriptions/${config.subscription}`,'/v1/webhook_endpoints','/v1/invoices','/v1/payment_intents']);
      for(const id of readonlyIds)allowed.add(`/v1/payment_methods/${id}`);
      for(const id of created.keys())allowed.add(`/v1/checkout/sessions/${id}`);
      requireSafe(allowed.has(url.pathname),'PROVIDER_READ_NOT_ALLOWLISTED');
      if(['/v1/invoices','/v1/payment_intents'].includes(url.pathname))requireSafe(url.searchParams.get('customer')===config.customer,'PROVIDER_LIST_CUSTOMER_MISMATCH');
    } else {
      requireSafe(method==='POST'&&verified&&config.mode==='setup-cancel','PROVIDER_WRITE_NOT_AUTHORIZED');
      requireSafe(url.search==='','PROVIDER_MUTATION_QUERY_REJECTED');
      if(url.pathname==='/v1/checkout/sessions') {
        assertCreate(config,values);requireSafe(createdCount===0,'SETUP_CREATION_BOUND_EXCEEDED');createdCount++;
        report.correlation=values['metadata[attempt_id]'];
      } else {
        const match=url.pathname.match(/^\/v1\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)\/expire$/);
        requireSafe(Boolean(match)&&created.has(match?.[1])&&Object.keys(values).length===0&&expiryCount===0,'PROVIDER_WRITE_NOT_ALLOWLISTED');expiryCount++;
      }
      requireSafe(typeof options.idempotencyKey==='string'&&/^payment-method-(setup|cancel):[0-9a-f-]{36}$/.test(options.idempotencyKey),'PROVIDER_IDEMPOTENCY_REQUIRED');
      report.providerPosts++;record();
    }
    report.providerCalls++;
    const signal=options.signal||AbortSignal.timeout(30_000);
    let response;
    try {
      response=await fetch(url,{method,redirect:'error',cache:'no-store',signal,headers:{Authorization:`Bearer ${config.key}`,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':options.idempotencyKey}:{})},...(method==='POST'?{body:new URLSearchParams(Object.entries(values).map(([key,value])=>[key,String(value)]))}:{})});
    } catch {throw new SandboxFailure('PROVIDER_NETWORK_OR_TIMEOUT');}
    if(!response.ok)throw new SandboxFailure(`PROVIDER_HTTP_${response.status}`);
    let object;try{object=await response.json();}catch{throw new SandboxFailure('PROVIDER_JSON_REQUIRED');}
    if(Object.hasOwn(object,'livemode'))requireSafe(object.livemode===false,'PROVIDER_LIVE_OBJECT_REJECTED');
    if(Array.isArray(object.data))requireSafe(object.data.every(item=>item.livemode===false||url.pathname==='/v1/webhook_endpoints'&&item.livemode===undefined),'PROVIDER_LIVE_LIST_REJECTED');
    const requestId=response.headers.get('request-id');options.onResponse?.({requestId:/^req_[A-Za-z0-9]+$/.test(requestId||'')?requestId:null});
    if(method==='POST'&&url.pathname==='/v1/checkout/sessions') {
      requireSafe(/^cs_test_[A-Za-z0-9_]+$/.test(object.id||'')&&object.mode==='setup'&&object.status==='open'&&object.customer===config.customer&&object.metadata?.subscription_id===config.subscription&&!object.subscription&&!object.payment_intent,'PROVIDER_SETUP_RESPONSE_MISMATCH');
      created.set(object.id,object.metadata.attempt_id);report.correlation=object.metadata.attempt_id;record();
    }
    return object;
  }
  const get=path=>provider('GET',path);
  const account=await get('/account');
  requireSafe(account.id===config.account,'ACCOUNT_MISMATCH');
  const customer=await get(`/customers/${config.customer}`);
  const subscription=await get(`/subscriptions/${config.subscription}`);
  assertAssociation(config,{account,customer,subscription});
  checked('account_customer_subscription_test_association');
  for(const value of [subscription.default_payment_method,customer.invoice_settings?.default_payment_method])if(identity(value))readonlyIds.add(identity(value));
  const endpoints=await get('/webhook_endpoints?limit=100');
  if(config.mode==='read-only') {report.status='PASS';checked('read_only_no_provider_posts');return;}
  assertNoFanout(endpoints);checked('legacy_webhook_fanout_absent_operator_attestation_required');
  requireSafe(!subscription.schedule&&!['canceled','incomplete_expired'].includes(subscription.status),'SUBSCRIPTION_NOT_SUPPORTED_FOR_SETUP_TEST');
  const list=async path=>{const value=await get(path);requireSafe(Array.isArray(value.data)&&value.has_more===false,'PROVIDER_LIST_INCOMPLETE');return value.data;};
  const invoices=await list(`/invoices?customer=${config.customer}&limit=100`);
  const intents=await list(`/payment_intents?customer=${config.customer}&limit=100`);
  requireSafe(!invoices.some(invoice=>['draft','open'].includes(invoice.status)),'EXISTING_INVOICE_ACTIVITY_REQUIRES_REVIEW');
  const baseline={subscription,customerDefaults:{invoice_settings:customer.invoice_settings,default_source:customer.default_source},invoices,intents};
  report.beforeDigest=digest(baseline);checked('durable_before_snapshot_digest');

  requireSafe(process.env.BILLING_SANDBOX_LOCAL_DATABASE==='girlzculture_clean','LOCAL_FIXTURE_DATABASE_REQUIRED');
  const run=localDatabase();
  const actor=randomUUID(),business=randomUUID();
  const email=`billing-sandbox-${actor}@example.test`;
  run(`begin;insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(${literal(actor)},${literal(email)},'',now(),'{"role":"salon_owner"}');insert into public.salons(id,user_id,email,name,slug,status) values(${literal(business)},${literal(actor)},${literal(email)},'Isolated billing fixture',${literal('billing-sandbox-'+business)},'Pending');insert into public.subscriptions(salon_id,tier,status,stripe_customer_id,stripe_subscription_id) values(${literal(business)},'Premium','active',${literal(config.customer)},${literal(config.subscription)});commit;`);
  const admin=localAdmin(run);
  const {loadNodeTypescript}=await import(pathToFileURL(resolve(root,'tests/helpers/load-node-typescript.mjs')).href);
  const load=loadNodeTypescript(root,{'@/lib/stripeServer':{
    siteUrl:()=> 'http://127.0.0.1:3199',
    stripeGet:(path,options)=>provider('GET',path,{},options),
    stripeRequest:(path,values,options)=>provider('POST',path,values,options),
  }});
  const api=load('src/lib/subscriptionPaymentMethodServer.ts');
  const input={admin,salonId:business,actorId:actor,request:new Request('http://127.0.0.1:3199/api/stripe/portal')};
  verified=true;
  try {
    const begun=await api.beginSubscriptionPaymentMethod(input);
    requireSafe(Boolean(begun.url)&&Boolean(begun.attemptId),'CORE_SETUP_RESULT_MISSING');
    checked('real_setup_created_by_application_server');
    const resumed=await api.beginSubscriptionPaymentMethod(input);
    requireSafe(resumed.attemptId===begun.attemptId&&createdCount===1,'CORE_SETUP_RESUME_NOT_IDEMPOTENT');
    checked('same_durable_attempt_resumed');
    const cancelled=await api.cancelSubscriptionPaymentMethod(admin,business,begun.attemptId);
    requireSafe(cancelled.cancelled===true&&cancelled.updated===false&&cancelled.expired===false,'CORE_CANCEL_NOT_VERIFIED');
    const replay=await api.cancelSubscriptionPaymentMethod(admin,business,begun.attemptId);
    requireSafe(replay.cancelled===true&&replay.updated===false&&expiryCount===1,'CORE_CANCEL_REPLAY_NOT_IDEMPOTENT');
    checked('real_setup_expired_and_terminal_replay_read_only');
    const afterCustomer=await get(`/customers/${config.customer}`);
    const after={subscription:await get(`/subscriptions/${config.subscription}`),customerDefaults:{invoice_settings:afterCustomer.invoice_settings,default_source:afterCustomer.default_source},invoices:await list(`/invoices?customer=${config.customer}&limit=100`),intents:await list(`/payment_intents?customer=${config.customer}&limit=100`)};
    report.afterDigest=digest(after);requireSafe(report.beforeDigest===report.afterDigest,'BILLING_BASELINE_CHANGED');
    requireSafe(createdCount===1&&expiryCount===1&&report.providerPosts===2,'PROVIDER_MUTATION_BOUND_MISMATCH');
    checked('subscription_all_fields_customer_defaults_invoice_and_payment_intent_snapshots_unchanged');
    report.status='PASS';
  } finally {
    // Only expire a session made by this run. Never apply/restore a method or
    // modify subscription/commercial fields as a failure-cleanup shortcut.
    for(const [sessionId,attemptId] of created) {
      try {
        const session=await get(`/checkout/sessions/${sessionId}`);
        if(session.status==='open'&&expiryCount===0)await api.cancelSubscriptionPaymentMethod(admin,business,attemptId);
        const final=await get(`/checkout/sessions/${sessionId}`);
        if(final.status!=='expired')report.recoveryRequired=true;
      } catch {report.recoveryRequired=true;}
    }
    if(createdCount!==created.size)report.recoveryRequired=true;
    requireSafe(!report.recoveryRequired,'SETUP_RECOVERY_REQUIRES_REVIEW');
  }
}

try {await main();} catch(error) {report.status='FAIL';report.error=safeSummary(error);process.exitCode=1;}
finally {record();console.log(JSON.stringify(report));}
