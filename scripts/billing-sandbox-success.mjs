// Provider-free prerequisite for the existing sandbox verifier, not a new mode.
// The caller must enforce its protected workflow/test-key/event-routing gates,
// supply fresh authoritative reads, and invoke this guard BEFORE transport.
// Caller arguments are not proof of GitHub permissions or hosted Checkout use.
import {assertAssociation,digest,identity,requireSafe} from './billing-sandbox-guards.mjs';

const id=(value,prefix)=>typeof value==='string'&&new RegExp(`^${prefix}_[A-Za-z0-9_]{1,200}$`).test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const same=(a,b)=>digest(a)===digest(b);
const defaults=customer=>({invoice_settings:{...customer.invoice_settings,default_payment_method:identity(customer.invoice_settings.default_payment_method)},default_source:identity(customer.default_source)});

function snapshotFacts(reviewed,snapshot){
 assertAssociation(reviewed,snapshot);
 const {subscription,customer}=snapshot;
 requireSafe(Object.hasOwn(subscription,'default_payment_method')&&Object.hasOwn(subscription,'default_source')&&Object.hasOwn(subscription,'schedule')&&subscription.schedule===null&&['active','trialing','past_due','unpaid','incomplete','paused'].includes(subscription.status),'SUCCESS_SUBSCRIPTION_UNSUPPORTED');
 requireSafe(customer.invoice_settings&&Object.hasOwn(customer.invoice_settings,'default_payment_method')&&Object.hasOwn(customer,'default_source'),'CUSTOMER_DEFAULTS_INCOMPLETE');
 for(const value of [subscription.default_payment_method,customer.invoice_settings.default_payment_method])requireSafe(value===null||id(identity(value),'pm'),'DEFAULT_METHOD_IDENTITY_INCOMPLETE');
 for(const value of [subscription.default_source,customer.default_source])requireSafe(value===null||/^[a-z][a-z0-9]*_[A-Za-z0-9_]{1,200}$/.test(identity(value)||''),'DEFAULT_SOURCE_IDENTITY_INCOMPLETE');
 const items=subscription.items;
 requireSafe(Array.isArray(items?.data)&&items.has_more===false&&items.data.length>0&&items.data.length<=100&&items.data.every(row=>id(row.id,'si')&&identity(row.subscription)===reviewed.subscription)&&new Set(items.data.map(row=>row.id)).size===items.data.length,'SUBSCRIPTION_ITEMS_INCOMPLETE');
 const lists={};
 for(const [key,prefix] of [['invoices','in'],['intents','pi']]){
  const list=snapshot[key];requireSafe(Array.isArray(list?.data)&&list.has_more===false&&list.data.length<=100,'PROVIDER_LIST_INCOMPLETE');
  requireSafe(list.data.every(row=>id(row.id,prefix)&&row.livemode===false&&identity(row.customer)===reviewed.customer)&&new Set(list.data.map(row=>row.id)).size===list.data.length,'PROVIDER_LIST_ASSOCIATION_MISMATCH');
  lists[key]=[...list.data].sort((a,b)=>a.id.localeCompare(b.id));
 }
 const commercial={...subscription,customer:identity(subscription.customer),default_source:identity(subscription.default_source)};
 delete commercial.default_payment_method;
 return {commercial,customerDefaults:defaults(customer),...lists};
}

export function createSandboxSuccessGuard(input){
 const {reviewed,attempt,baseline,createdSessionId}=structuredClone(input);
 for(const [key,prefix] of [['account','acct'],['customer','cus'],['subscription','sub']])requireSafe(id(reviewed[key],prefix),'REVIEWED_IDENTITIES_REQUIRED');
 requireSafe(/^[0-9a-f]{40}$/.test(reviewed.approvedSha||'')&&reviewed.approvedSha===reviewed.runSha,'REVIEWED_COMMIT_REQUIRED');
 requireSafe(uuid(attempt.id)&&uuid(attempt.salon_id)&&attempt.stripe_customer_id===reviewed.customer&&attempt.stripe_subscription_id===reviewed.subscription&&attempt.livemode===false&&id(createdSessionId,'cs_test')&&attempt.stripe_checkout_session_id===createdSessionId,'SUCCESS_ATTEMPT_BINDING_MISMATCH');
 requireSafe(['open','processing','completed'].includes(attempt.status)&&!attempt.schedule_baseline,'SUCCESS_ATTEMPT_UNSUPPORTED');
 const before=snapshotFacts(reviewed,baseline),originalDefault=identity(baseline.subscription.default_payment_method);
 const effective=originalDefault||identity(baseline.subscription.default_source)||identity(baseline.customer.invoice_settings.default_payment_method)||identity(baseline.customer.default_source);
 requireSafe(attempt.baseline_payment_method_id===effective,'SUCCESS_ATTEMPT_BASELINE_MISMATCH');
 requireSafe(!before.invoices.some(row=>['draft','open'].includes(row.status)),'EXISTING_INVOICE_ACTIVITY_REQUIRES_REVIEW');
 let setupId=null,methodId=null,mask=null,writes=0,sealed=false;
 const own=object=>object?.livemode===false&&identity(object.customer)===reviewed.customer;
 const metadata=object=>object?.metadata?.type==='subscription_payment_method'&&object.metadata.attempt_id===attempt.id&&object.metadata.salon_id===attempt.salon_id&&object.metadata.subscription_id===reviewed.subscription;
 const unchanged=snapshot=>requireSafe(same(before,snapshotFacts(reviewed,snapshot)),'BILLING_BASELINE_CHANGED');
 const assertRead=path=>requireSafe(path===`/checkout/sessions/${createdSessionId}`||(setupId&&path===`/setup_intents/${setupId}`)||(methodId&&path===`/payment_methods/${methodId}`),'SUCCESS_READ_NOT_ALLOWLISTED');
 const observeRead=(path,object)=>{
  assertRead(path);
  if(path===`/checkout/sessions/${createdSessionId}`){
   requireSafe(object?.id===createdSessionId&&own(object)&&metadata(object)&&object.mode==='setup'&&object.status==='complete'&&object.subscription===null&&object.payment_intent===null&&id(identity(object.setup_intent),'seti'),'SUCCESS_SESSION_NOT_VERIFIED');
   requireSafe(!setupId||setupId===identity(object.setup_intent),'SUCCESS_SETUP_CHANGED');setupId=identity(object.setup_intent);
  }else if(path===`/setup_intents/${setupId}`){
   requireSafe(object?.id===setupId&&own(object)&&metadata(object)&&object.status==='succeeded'&&object.usage==='off_session'&&id(identity(object.payment_method),'pm'),'SUCCESS_SETUP_NOT_VERIFIED');
   requireSafe(!methodId||methodId===identity(object.payment_method),'SUCCESS_METHOD_CHANGED');methodId=identity(object.payment_method);
  }else{
   const card=object?.card;
   requireSafe(object?.id===methodId&&own(object)&&object.type==='card'&&/^[a-z_]{2,30}$/.test(card?.brand||'')&&/^\d{4}$/.test(card?.last4||'')&&Number.isInteger(card.exp_month)&&card.exp_month>=1&&card.exp_month<=12&&Number.isInteger(card.exp_year)&&card.exp_year>=2000&&card.exp_year<=9999,'SUCCESS_CARD_NOT_VERIFIED');
   const observed={type:'card',brand:card.brand,last4:card.last4,expMonth:card.exp_month,expYear:card.exp_year};
   requireSafe(!mask||same(mask,observed),'SUCCESS_CARD_CHANGED');mask=observed;
   requireSafe(methodId!==originalDefault,'SUCCESS_REPLACEMENT_NOT_OBSERVED');
  }
 };
 return Object.freeze({
  assertRead,observeRead,
  assertReturn(url){
   let parsed;try{parsed=new URL(url);}catch{requireSafe(false,'SUCCESS_RETURN_MISMATCH');}
   requireSafe(parsed.origin==='http://127.0.0.1:3199'&&parsed.pathname==='/salon/dashboard/subscription'&&!parsed.username&&!parsed.password&&!parsed.hash&&[...parsed.searchParams].length===1&&parsed.searchParams.get('payment_method_session')===createdSessionId,'SUCCESS_RETURN_MISMATCH');
  },
  async proveSetup(read){
   for(const path of [()=>`/checkout/sessions/${createdSessionId}`,()=>`/setup_intents/${setupId}`,()=>`/payment_methods/${methodId}`]){const current=path();assertRead(current);observeRead(current,await read(current));}
  },
  assertDefaultWrite(path,values,options,snapshot){
   requireSafe(reviewed.authorizeDefaultWrite===true&&!sealed&&writes===0&&mask!==null,'SUCCESS_WRITE_NOT_AUTHORIZED');
   requireSafe(path===`/subscriptions/${reviewed.subscription}`&&values&&Object.keys(values).length===1&&Object.keys(values)[0]==='default_payment_method'&&values.default_payment_method===methodId&&options?.idempotencyKey===`payment-method-apply:${attempt.id}`,'SUCCESS_WRITE_NOT_ALLOWLISTED');
   unchanged(snapshot);requireSafe(identity(snapshot.subscription.default_payment_method)===originalDefault,'SUCCESS_DEFAULT_DRIFT');writes++;
  },
  seal(){sealed=true;},
  verifySaved({result,reloaded,replay,attempt:finalAttempt,snapshot}){
   requireSafe(sealed&&mask!==null,'SUCCESS_EVIDENCE_INCOMPLETE');unchanged(snapshot);
   requireSafe(identity(snapshot.subscription.default_payment_method)===methodId,'SUCCESS_DEFAULT_NOT_PERSISTED');
   for(const key of ['id','salon_id','stripe_customer_id','stripe_subscription_id','stripe_checkout_session_id','livemode'])requireSafe(finalAttempt?.[key]===attempt[key],'SUCCESS_FINAL_ATTEMPT_MISMATCH');
   requireSafe(finalAttempt.status==='completed'&&finalAttempt.stripe_setup_intent_id===setupId&&finalAttempt.stripe_payment_method_id===methodId,'SUCCESS_ATTEMPT_NOT_COMPLETED');
   requireSafe(result?.updated===true&&replay?.updated===true,'SUCCESS_APP_NOT_COMPLETED');
   for(const status of [result,reloaded,replay])requireSafe(status?.billingMode==='test'&&status.status==='available'&&status.updatePending===false&&status.pending!==true&&status.cancelled!==true&&status.expired!==true&&same(status.paymentMethod,mask),'SUCCESS_MASKED_READBACK_MISMATCH');
   return {status:'PASS',applicationReady:false,sha:reviewed.runSha,commercialDigest:digest(before),checks:['same_setup_and_customer','subscription_default_saved','fresh_masked_status','terminal_replay_read_only','commercial_and_customer_defaults_unchanged','invoice_and_payment_intent_snapshots_unchanged']};
  },
 });
}

// Callbacks must use the real app core and fresh provider/local-DB reads. This
// orchestration does not implement a hosted Checkout driver, UI proof, local DB
// setup, credentials or networking, and never retries or restores on failure.
export async function verifySandboxSuccess({guard,returnedUrl,read,complete,reload,replay,readFinal}){
 guard.assertReturn(returnedUrl);await guard.proveSetup(read);
 let result;try{result=await complete();}finally{guard.seal();}
 const reloaded=await reload(),replayed=await replay(),final=await readFinal();
 return guard.verifySaved({result,reloaded,replay:replayed,...final});
}
