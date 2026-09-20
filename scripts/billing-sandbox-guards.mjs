import { createHash } from 'node:crypto';

export class SandboxFailure extends Error {
  constructor(code) { super(code); this.code=code; }
}
export function requireSafe(ok,code) { if(!ok) throw new SandboxFailure(code); }
export const identity=value=>typeof value==='string'?value:value?.id||null;
export function configuration(env) {
  const mode=env.BILLING_SANDBOX_MODE||'read-only';
  requireSafe(['read-only','setup-cancel'].includes(mode),'MODE_NOT_IMPLEMENTED');
  const key=env.STRIPE_SANDBOX_SECRET_KEY;
  requireSafe(typeof key==='string'&&/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key),'SANDBOX_TEST_KEY_REQUIRED');
  const values={mode,key,account:env.BILLING_SANDBOX_ACCOUNT_ID,customer:env.BILLING_SANDBOX_CUSTOMER_ID,subscription:env.BILLING_SANDBOX_SUBSCRIPTION_ID};
  for(const [field,prefix] of [['account','acct'],['customer','cus'],['subscription','sub']]) requireSafe(new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(values[field]||''),'REVIEWED_IDENTITIES_REQUIRED');
  requireSafe(/^[0-9a-f]{40}$/.test(env.BILLING_SANDBOX_APPROVED_SHA||'')&&env.GITHUB_SHA===env.BILLING_SANDBOX_APPROVED_SHA,'REVIEWED_COMMIT_REQUIRED');
  requireSafe(env.GITHUB_REPOSITORY==='girlzculture/girlzculture'&&env.GITHUB_EVENT_NAME==='workflow_dispatch','MANUAL_FIRST_PARTY_RUN_REQUIRED');
  if(mode!=='read-only') requireSafe(env.BILLING_SANDBOX_AUTHORIZE_SETUP_CANCEL==='true'&&env.BILLING_SANDBOX_EVENT_ROUTING_REVIEWED==='true','SETUP_CANCEL_APPROVAL_REQUIRED');
  return values;
}
export function assertAssociation(config,{account,customer,subscription}) {
  requireSafe(account?.id===config.account,'ACCOUNT_MISMATCH');
  requireSafe(customer?.id===config.customer&&customer.deleted!==true&&customer.livemode===false,'CUSTOMER_MODE_OR_IDENTITY_MISMATCH');
  requireSafe(subscription?.id===config.subscription&&subscription.livemode===false&&identity(subscription.customer)===config.customer,'SUBSCRIPTION_MODE_OR_IDENTITY_MISMATCH');
}
export function assertNoFanout(endpoints) {
  requireSafe(Array.isArray(endpoints?.data)&&endpoints.has_more===false,'WEBHOOK_INVENTORY_INCOMPLETE');
  const events=new Set(['*','checkout.session.created','checkout.session.completed','checkout.session.expired','setup_intent.created','setup_intent.canceled','setup_intent.succeeded','payment_method.attached','customer.subscription.updated']);
  requireSafe(!endpoints.data.some(endpoint=>endpoint.status==='enabled'&&(!Array.isArray(endpoint.enabled_events)||endpoint.enabled_events.some(event=>events.has(event)))),'SANDBOX_WEBHOOK_FANOUT_BLOCKED');
}
export function canonical(value) {
  if(Array.isArray(value)) return value.map(canonical);
  if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
export const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function assertCreate(config,values) {
  requireSafe(config.mode==='setup-cancel','PROVIDER_WRITE_NOT_AUTHORIZED');
  const expected=new Set(['mode','customer','payment_method_types[0]','setup_intent_data[usage]','success_url','cancel_url','expires_at',
    ...['type','attempt_id','salon_id','subscription_id'].flatMap(key=>[`metadata[${key}]`,`setup_intent_data[metadata][${key}]`])]);
  requireSafe(Object.keys(values).length===expected.size&&Object.keys(values).every(key=>expected.has(key)),'SETUP_PAYLOAD_NOT_ALLOWLISTED');
  requireSafe(values.mode==='setup'&&values.customer===config.customer&&values['payment_method_types[0]']==='card'&&values['setup_intent_data[usage]']==='off_session','SETUP_MODE_OR_CUSTOMER_MISMATCH');
  requireSafe(values['metadata[type]']==='subscription_payment_method'&&values['setup_intent_data[metadata][type]']==='subscription_payment_method','SETUP_METADATA_MISMATCH');
  for(const key of ['attempt_id','salon_id','subscription_id']) requireSafe(values[`metadata[${key}]`]===values[`setup_intent_data[metadata][${key}]`],'SETUP_METADATA_MISMATCH');
  requireSafe(values['metadata[subscription_id]']===config.subscription,'SETUP_SUBSCRIPTION_MISMATCH');
  for(const key of ['success_url','cancel_url']) {
    const url=new URL(values[key]);
    requireSafe(url.origin==='http://127.0.0.1:3199'&&url.pathname==='/salon/dashboard/subscription'&&!url.username&&!url.password,'SETUP_RETURN_ORIGIN_MISMATCH');
  }
}
export function safeSummary(error) {
  return error instanceof SandboxFailure&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'SANDBOX_VERIFICATION_FAILED';
}
