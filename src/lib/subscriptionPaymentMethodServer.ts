import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserSafeRequestError } from "@/lib/platformErrors";
import { siteUrl, stripeGet, stripeRequest } from "@/lib/stripeServer";
import { assertPaymentMethodAssociation, assertPaymentMethodSetup, maskedPaymentMethod, stripeIdentity, type PaymentMethod, type StripeIdentity, type SubscriptionBillingIdentity } from "@/lib/subscriptionPaymentMethodCore";
import { assertScheduleUnchanged, inspectInheritedSchedule, scheduleMethodPayload, type PaymentScheduleBaseline } from "@/lib/subscriptionPaymentSchedule";

type Attempt = {
  id: string; salon_id: string; stripe_customer_id: string; stripe_subscription_id: string;
  stripe_checkout_session_id: string | null; stripe_payment_method_id?: string | null;
  baseline_payment_method_id: string | null; first_apply_at: string | null;
  schedule_baseline?:PaymentScheduleBaseline|null; schedule_first_apply_at?:string|null; schedule_verified_at?:string|null;
  livemode: boolean; status: string; created_at: string;
};
type Customer = { id?: string; livemode?: boolean; deleted?: boolean;
  invoice_settings?: { default_payment_method?: string | PaymentMethod | null };
  default_source?: SubscriptionBillingIdentity["default_source"];
};
type Subscription = SubscriptionBillingIdentity & { customer?: string | Customer; [key: string]: unknown };
type Session = { id?: string; url?: string | null; mode?: string; status?: string; customer?: StripeIdentity;
  livemode?: boolean; metadata?: Record<string,string>; setup_intent?: StripeIdentity;
  subscription?: StripeIdentity; payment_intent?: StripeIdentity };
type Setup = { id?: string; status?: string; customer?: StripeIdentity; livemode?: boolean;
  metadata?: Record<string,string>; payment_method?: StripeIdentity };
const terminal = new Set(["completed","cancelled","expired","failed"]);
const table = "subscription_payment_method_attempts";
const safeId = (value: unknown, kind: string) => typeof value === "string" && new RegExp(`^${kind}_[A-Za-z0-9_]{1,200}$`).test(value);
const safeUuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function paymentMethodProvider() {
  // One deadline for the whole operation, not a new allowance per request.
  // It remains well inside the two-minute DB lease. Other Stripe flows retain
  // their existing behavior because the shared transport option is optional.
  const signal=AbortSignal.timeout(45_000);
  return {
    get:<T>(path:string)=>stripeGet<T>(path,{signal}),
    post:<T>(path:string,values:Parameters<typeof stripeRequest>[1],options?:Parameters<typeof stripeRequest>[2])=>stripeRequest<T>(path,values,{...options,signal}),
    assertActive:()=>signal.throwIfAborted(),
  };
}
type PaymentMethodProvider=ReturnType<typeof paymentMethodProvider>;

async function rpc<T>(admin: SupabaseClient, name: string, values: Record<string,unknown>): Promise<T> {
  const result = await admin.rpc(name, values);
  if (result.error) throw result.error;
  return result.data as T;
}

async function billingIdentity(admin: SupabaseClient, salonId: string,provider:PaymentMethodProvider) {
  const stored = await admin.from("subscriptions").select("stripe_customer_id,stripe_subscription_id").eq("salon_id",salonId).maybeSingle();
  if (stored.error) throw stored.error;
  if (!safeId(stored.data?.stripe_customer_id,"cus") || !safeId(stored.data?.stripe_subscription_id,"sub")) {
    throw new UserSafeRequestError("No existing Stripe subscription is linked to this business.",409);
  }
  const customerId = stored.data!.stripe_customer_id as string;
  const subscriptionId = stored.data!.stripe_subscription_id as string;
  const subscription = await provider.get<Subscription>(`/subscriptions/${subscriptionId}?expand[]=default_payment_method&expand[]=default_source&expand[]=customer.invoice_settings.default_payment_method&expand[]=customer.default_source`);
  assertPaymentMethodAssociation(subscription,customerId,subscriptionId);
  const customer = typeof subscription.customer === "object" && subscription.customer ? subscription.customer
    : await provider.get<Customer>(`/customers/${customerId}?expand[]=invoice_settings.default_payment_method&expand[]=default_source`);
  if (customer.deleted || customer.id !== customerId || customer.livemode !== subscription.livemode) throw new Error("PAYMENT_METHOD_CUSTOMER_IDENTITY_CONFLICT");
  return { subscription,customer,customerId,subscriptionId,livemode:subscription.livemode! };
}

function assertCanUpdate(subscription: Subscription) {
  if (["canceled","incomplete_expired"].includes(subscription.status || "")) {
    throw new UserSafeRequestError("This subscription has ended. Its payment method cannot be updated here.",409);
  }
}

async function readSchedule(identity:Awaited<ReturnType<typeof billingIdentity>>,provider:PaymentMethodProvider) {
 const id=stripeIdentity(identity.subscription.schedule);
 if(!id)return null;
 if(!safeId(id,"sub_sched"))throw new Error("PAYMENT_SCHEDULE_IDENTITY_CONFLICT");
 const schedule=await provider.get(`/subscription_schedules/${id}`);
 return inspectInheritedSchedule(schedule,identity.subscription,identity.customerId,identity.livemode);
}
function assertRetryWindow(first:string|null|undefined) {
 if(first&&(!Number.isFinite(Date.parse(first))||Date.now()-Date.parse(first)>=23*60*60_000))throw new UserSafeRequestError("The earlier payment update is too old to retry safely. Billing support must review the current payment method.",409);
}

async function readMasked(identity: Awaited<ReturnType<typeof billingIdentity>>,provider:PaymentMethodProvider) {
  const { subscription, customer,customerId,livemode } = identity;
  // Respect Stripe's actual precedence, including legacy subscription sources.
  const method = subscription.default_payment_method;
  const source = subscription.default_source;
  const effective = method || source || customer.invoice_settings?.default_payment_method || customer.default_source;
  if (!effective) return null;
  if (method || (!source && customer.invoice_settings?.default_payment_method)) {
    const value = typeof effective === "string" ? await provider.get<PaymentMethod>(`/payment_methods/${effective}`) : effective as PaymentMethod;
    if (stripeIdentity(value.customer) !== customerId || value.livemode !== livemode) throw new Error("PAYMENT_METHOD_READBACK_IDENTITY_CONFLICT");
    return maskedPaymentMethod(value);
  }
  const legacy = typeof effective === "string"
    ? await provider.get<{ object?: string; brand?: string; last4?: string; exp_month?: number; exp_year?: number }>(`/customers/${customerId}/sources/${effective}`) : effective;
  return legacy && "object" in legacy && legacy.object === "card"
    ? maskedPaymentMethod({ type:"card",card: { ...legacy,brand: typeof legacy.brand === "string" ? legacy.brand.toLowerCase().replace(/ /g,"_") : "card" } }) : null;
}

function effectiveMethodId(identity: Awaited<ReturnType<typeof billingIdentity>>) {
  return stripeIdentity(identity.subscription.default_payment_method || identity.subscription.default_source
    || identity.customer.invoice_settings?.default_payment_method || identity.customer.default_source);
}

export async function subscriptionPaymentMethodStatus(admin: SupabaseClient,salonId: string,provider=paymentMethodProvider()) {
  const identity = await billingIdentity(admin,salonId,provider);
  const pending = await admin.from(table).select("id").eq("salon_id",salonId).in("status",["reserved","open","processing"]).maybeSingle();
  if (pending.error) throw pending.error;
  const paymentMethod = await readMasked(identity,provider);
  const hasEffective = Boolean(identity.subscription.default_payment_method || identity.subscription.default_source || identity.customer.invoice_settings?.default_payment_method || identity.customer.default_source);
  let scheduleAllowed=true;
  try{await readSchedule(identity,provider);}catch(error){if(error instanceof Error&&/^PAYMENT_SCHEDULE_/.test(error.message))scheduleAllowed=false;else throw error;}
  return { paymentMethod,status: paymentMethod ? "available" : hasEffective ? "unavailable" : "none",
    updatePending:Boolean(pending.data),billingMode:identity.livemode ? "live" : "test",
    updateAllowed:scheduleAllowed && !["canceled","incomplete_expired"].includes(identity.subscription.status || ""),
    ...(!scheduleAllowed ? { warning:"A scheduled plan change requires billing support review before updating this payment method." } : {}) };
}

export async function beginSubscriptionPaymentMethod(input: { admin: SupabaseClient;salonId: string;actorId: string;request: Request }) {
  const {admin,salonId,actorId,request} = input;
  const provider=paymentMethodProvider();
  const identity = await billingIdentity(admin,salonId,provider);
  assertCanUpdate(identity.subscription);
  let schedule:PaymentScheduleBaseline|null;
  try{schedule=await readSchedule(identity,provider);}catch(error){if(error instanceof Error&&/^PAYMENT_SCHEDULE_/.test(error.message))throw new UserSafeRequestError("This subscription has a scheduled plan change. Its payment method needs billing support review so the scheduled plan remains unchanged.",409);throw error;}
  const attempt = await rpc<Attempt>(admin,schedule?"reserve_scheduled_payment_method_attempt":"reserve_subscription_payment_method_attempt",{
    p_salon_id:salonId,p_actor_id:actorId,p_customer_id:identity.customerId,p_subscription_id:identity.subscriptionId,p_livemode:identity.livemode,
    p_baseline_method_id:effectiveMethodId(identity),
    ...(schedule?{p_schedule:schedule}:{}),
  });
  if (attempt.stripe_checkout_session_id) {
    const session = await provider.get<Session>(`/checkout/sessions/${attempt.stripe_checkout_session_id}`);
    assertSessionOwner(session,attempt);
    if (session.status === "open" && session.url) return { url:checkoutUrl(session.url),attemptId:attempt.id };
    if (session.status === "complete") return completeSubscriptionPaymentMethod(admin,session.id!,salonId);
    if (session.status === "expired") {
      await completeSubscriptionPaymentMethod(admin,session.id!,salonId);
      throw new UserSafeRequestError("The previous update session expired. Please try again to open a new one.",409);
    }
    throw new UserSafeRequestError("A payment method update is already being verified. Please refresh shortly.",409);
  }
  // The stable creation request expires one hour after reservation. Stripe
  // requires at least 30 minutes remaining; never change the old request's
  // parameters or blindly create another session after an uncertain response.
  if (!Number.isFinite(Date.parse(attempt.created_at)) || Date.now()-Date.parse(attempt.created_at)>=29*60_000) {
    throw new UserSafeRequestError("The previous update session could not be verified. Billing support must review it before another session can be opened.",409);
  }
  const metadata = { type:"subscription_payment_method",attempt_id:attempt.id,salon_id:salonId,subscription_id:identity.subscriptionId };
  const values: Record<string,string|number> = {
    mode:"setup",customer:identity.customerId,"payment_method_types[0]":"card",
    "setup_intent_data[usage]":"off_session",
    success_url:`${siteUrl(request)}/salon/dashboard/subscription?payment_method_session={CHECKOUT_SESSION_ID}`,
    cancel_url:`${siteUrl(request)}/salon/dashboard/subscription?payment_method_cancel=${attempt.id}`,
    expires_at:Math.floor(Date.parse(attempt.created_at)/1000)+3600,
  };
  for (const [key,value] of Object.entries(metadata)) {
    values[`metadata[${key}]`] = value;
    values[`setup_intent_data[metadata][${key}]`] = value;
  }
  let requestId: string|null = null;
  const session = await provider.post<Session>("/checkout/sessions",values,{
    idempotencyKey:`payment-method-setup:${attempt.id}`,onResponse:evidence=>{requestId=evidence.requestId;},
  });
  if (!safeId(session.id,"cs")) throw new Error("PAYMENT_METHOD_SESSION_MISSING");
  assertSessionOwner(session,{...attempt,stripe_checkout_session_id:session.id!});
  await rpc(admin,"bind_subscription_payment_method_attempt",{p_attempt_id:attempt.id,p_session_id:session.id,p_request_id:requestId});
  if (!session.url) throw new Error("PAYMENT_METHOD_CHECKOUT_URL_MISSING");
  return { url:checkoutUrl(session.url),attemptId:attempt.id };
}

function checkoutUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password) throw new Error("PAYMENT_METHOD_CHECKOUT_URL_INVALID");
  return value;
}
function assertSessionOwner(session: Session,attempt: Attempt) {
  if (session.id !== attempt.stripe_checkout_session_id || session.mode !== "setup" || stripeIdentity(session.customer) !== attempt.stripe_customer_id
    || session.livemode !== attempt.livemode || session.metadata?.type !== "subscription_payment_method"
    || session.metadata.attempt_id !== attempt.id || session.metadata.salon_id !== attempt.salon_id
    || session.metadata.subscription_id !== attempt.stripe_subscription_id || session.subscription || session.payment_intent) throw new Error("PAYMENT_METHOD_SESSION_IDENTITY_CONFLICT");
}

/** Used by both authenticated return and the signature-verified webhook. */
export async function completeSubscriptionPaymentMethod(admin: SupabaseClient,sessionId: string,salonId?: string,cancel=false) {
  const provider=paymentMethodProvider();
  if (!safeId(sessionId,"cs")) throw new UserSafeRequestError("The payment update session is invalid.",400);
  let query = admin.from(table).select("*").eq("stripe_checkout_session_id",sessionId);
  if (salonId) query=query.eq("salon_id",salonId);
  const found=await query.maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) throw new UserSafeRequestError("This payment update does not belong to this business.",404);
  const attempt=found.data as Attempt;
  const identity=await billingIdentity(admin,attempt.salon_id,provider);
  if (identity.customerId!==attempt.stripe_customer_id || identity.subscriptionId!==attempt.stripe_subscription_id || identity.livemode!==attempt.livemode) throw new Error("PAYMENT_METHOD_ATTEMPT_IDENTITY_CONFLICT");
  if (terminal.has(attempt.status)) {
    // Replays only read the current method; never reapply the old setup.
    return { updated:attempt.status==="completed",cancelled:attempt.status==="cancelled",expired:attempt.status==="expired",...(await subscriptionPaymentMethodStatus(admin,attempt.salon_id,provider)) };
  }
  const lease=randomUUID();
  const claim=await rpc<{claimed:boolean;attempt:Attempt}>(admin,"claim_subscription_payment_method_attempt",{p_attempt_id:attempt.id,p_session_id:sessionId,p_lease_id:lease});
  if (!claim.claimed) return {updated:false,pending:true};
  const finish=async(status:string,setupId:string|null=null,methodId:string|null=null,requestId:string|null=null)=>{
    const done=await rpc<boolean>(admin,"finish_subscription_payment_method_attempt",{p_attempt_id:attempt.id,p_lease_id:lease,p_status:status,p_setup_intent_id:setupId,p_payment_method_id:methodId,p_request_id:requestId});
    if (!done) throw new Error("PAYMENT_METHOD_LEASE_LOST");
  };
  let session=await provider.get<Session>(`/checkout/sessions/${sessionId}`);
  assertSessionOwner(session,attempt);
  if (cancel && session.status === "open") {
    // Expire before reporting cancellation; a completed Checkout cannot be
    // undone by visiting a cancel URL. Uncertain responses retain the lease.
    try { await provider.post(`/checkout/sessions/${sessionId}/expire`,{}, {idempotencyKey:`payment-method-cancel:${attempt.id}`}); }
    catch (error) {
      session=await provider.get<Session>(`/checkout/sessions/${sessionId}`);
      if (session.status!=="complete" && session.status!=="expired") throw error;
    }
    session=await provider.get<Session>(`/checkout/sessions/${sessionId}`);
    assertSessionOwner(session,attempt);
  }
  if (session.status === "expired") {
    await finish(cancel ? "cancelled":"expired");
    return {updated:false,cancelled:cancel,expired:!cancel,...(await subscriptionPaymentMethodStatus(admin,attempt.salon_id,provider))};
  }
  if (session.status !== "complete") {
    await finish("open");
    return {updated:false,pending:true};
  }
  const setupId=stripeIdentity(session.setup_intent);
  if (!safeId(setupId,"seti")) throw new Error("PAYMENT_METHOD_SETUP_MISSING");
  const setup=await provider.get<Setup>(`/setup_intents/${setupId}`);
  const methodId=stripeIdentity(setup.payment_method);
  if (!safeId(methodId,"pm")) throw new Error("PAYMENT_METHOD_SETUP_METHOD_MISSING");
  const method=await provider.get<PaymentMethod>(`/payment_methods/${methodId}`);
  assertPaymentMethodSetup({session,setup,method,attempt});
  const before=await billingIdentity(admin,attempt.salon_id,provider);
  assertCanUpdate(before.subscription);
  if (before.customerId!==attempt.stripe_customer_id || before.subscriptionId!==attempt.stripe_subscription_id || before.livemode!==attempt.livemode) throw new Error("PAYMENT_METHOD_ATTEMPT_IDENTITY_CONFLICT");
  if(claim.attempt.schedule_baseline){
    const methodRequestId=await applyScheduleMethod({admin,attempt:claim.attempt,lease,setupId:setupId!,methodId:methodId!,provider,before});
    await finish("completed",setupId,methodId,methodRequestId);
    return {updated:true,cancelled:false,expired:false,...(await subscriptionPaymentMethodStatus(admin,attempt.salon_id,provider))};
  }
  if(stripeIdentity(before.subscription.schedule))throw new Error("PAYMENT_SCHEDULE_BASELINE_CHANGED");
  if (stripeIdentity(before.subscription.default_payment_method) === methodId) {
    // A lost provider response may already have applied the intended method.
    // Read-only reconciliation is safe even after Stripe prunes idempotency.
    await finish("completed",setupId,methodId);
    return {updated:true,cancelled:false,expired:false,...(await subscriptionPaymentMethodStatus(admin,attempt.salon_id,provider))};
  }
  const claimedAttempt=claim.attempt;
  if (claimedAttempt.first_apply_at && (!Number.isFinite(Date.parse(claimedAttempt.first_apply_at))
    || Date.now()-Date.parse(claimedAttempt.first_apply_at)>=23*60*60_000)) {
    throw new UserSafeRequestError("The earlier payment update is too old to retry safely. Billing support must review the current payment method.",409);
  }
  if (!claimedAttempt.first_apply_at && effectiveMethodId(before)!==claimedAttempt.baseline_payment_method_id) {
    throw new UserSafeRequestError("The payment method changed after this update was opened. Billing support must review this older session before it can be applied.",409);
  }
  provider.assertActive();
  const marked=await rpc<Attempt>(admin,"mark_subscription_payment_method_apply",{
    p_attempt_id:attempt.id,p_lease_id:lease,p_setup_intent_id:setupId,p_payment_method_id:methodId,
  });
  if (!marked.first_apply_at || !Number.isFinite(Date.parse(marked.first_apply_at))
    || Date.now()-Date.parse(marked.first_apply_at)>=23*60*60_000) throw new UserSafeRequestError("The earlier payment update needs billing support review before it can be retried.",409);
  let requestId:string|null=null;
  // No customer-wide default, plan, price, invoice, proration, cancellation,
  // schedule, trial, payment or billing-cycle mutation is permitted here.
  provider.assertActive();
  await provider.post(`/subscriptions/${attempt.stripe_subscription_id}`,{default_payment_method:methodId},{
    idempotencyKey:`payment-method-apply:${attempt.id}`,onResponse:evidence=>{requestId=evidence.requestId;},
  });
  const after=await billingIdentity(admin,attempt.salon_id,provider);
  if (stripeIdentity(after.subscription.default_payment_method)!==methodId || after.customerId!==attempt.stripe_customer_id || after.livemode!==attempt.livemode) throw new Error("PAYMENT_METHOD_AUTHORITATIVE_READBACK_FAILED");
  assertCanUpdate(after.subscription);
  if(stripeIdentity(after.subscription.schedule))throw new Error("PAYMENT_SCHEDULE_BASELINE_CHANGED");
  await finish("completed",setupId,methodId,requestId);
  return {updated:true,cancelled:false,expired:false,...(await subscriptionPaymentMethodStatus(admin,attempt.salon_id,provider))};
}

async function applyScheduleMethod(input:{admin:SupabaseClient;attempt:Attempt;lease:string;setupId:string;methodId:string;provider:PaymentMethodProvider;before:Awaited<ReturnType<typeof billingIdentity>>}) {
 const {admin,attempt,lease,setupId,methodId,provider}=input,baseline=attempt.schedule_baseline!;
 let methodRequestId:string|null=null;
 let identity=input.before,current=await readSchedule(identity,provider);
 if(!current)throw new Error("PAYMENT_SCHEDULE_BASELINE_CHANGED");
 assertScheduleUnchanged(current,baseline);
 const mark=(verified:boolean,requestId:string|null=null)=>rpc<Attempt>(admin,"mark_payment_schedule_apply",{p_attempt_id:attempt.id,p_lease_id:lease,p_setup_intent_id:setupId,p_payment_method_id:methodId,p_verified:verified,p_request_id:requestId});
 if(current.default_method!==methodId){
  if(current.default_method!==baseline.default_method)throw new Error("PAYMENT_SCHEDULE_DEFAULT_CHANGED");
  if(effectiveMethodId(identity)!==attempt.baseline_payment_method_id&&stripeIdentity(identity.subscription.default_payment_method)!==methodId)throw new Error("PAYMENT_SCHEDULE_CURRENT_METHOD_CHANGED");
  assertRetryWindow(attempt.schedule_first_apply_at);provider.assertActive();
  const marked=await mark(false);assertRetryWindow(marked.schedule_first_apply_at);
  if(!marked.schedule_first_apply_at)throw new Error("PAYMENT_SCHEDULE_STAGE_MISSING");
  let requestId:string|null=null;provider.assertActive();
  await provider.post(`/subscription_schedules/${String(baseline.schedule.id)}`,scheduleMethodPayload(methodId),{idempotencyKey:`payment-method-schedule:${attempt.id}`,onResponse:evidence=>{requestId=evidence.requestId;}});
  identity=await billingIdentity(admin,attempt.salon_id,provider);current=await readSchedule(identity,provider);
  if(!current||current.default_method!==methodId)throw new Error("PAYMENT_SCHEDULE_READBACK_FAILED");
  assertScheduleUnchanged(current,baseline);await mark(true,requestId);
 }else await mark(true);
 if(stripeIdentity(identity.subscription.default_payment_method)!==methodId){
  if(effectiveMethodId(identity)!==attempt.baseline_payment_method_id)throw new Error("PAYMENT_SCHEDULE_CURRENT_METHOD_CHANGED");
  assertRetryWindow(attempt.first_apply_at);provider.assertActive();
  const marked=await rpc<Attempt>(admin,"mark_subscription_payment_method_apply",{p_attempt_id:attempt.id,p_lease_id:lease,p_setup_intent_id:setupId,p_payment_method_id:methodId});
  assertRetryWindow(marked.first_apply_at);if(!marked.first_apply_at)throw new Error("PAYMENT_METHOD_STAGE_MISSING");
  provider.assertActive();
  await provider.post(`/subscriptions/${attempt.stripe_subscription_id}`,{default_payment_method:methodId},{idempotencyKey:`payment-method-apply:${attempt.id}`,onResponse:evidence=>{methodRequestId=evidence.requestId;}});
 }
 const after=await billingIdentity(admin,attempt.salon_id,provider),scheduleAfter=await readSchedule(after,provider);
 if(after.customerId!==attempt.stripe_customer_id||after.subscriptionId!==attempt.stripe_subscription_id||after.livemode!==attempt.livemode||stripeIdentity(after.subscription.default_payment_method)!==methodId||!scheduleAfter||scheduleAfter.default_method!==methodId)throw new Error("PAYMENT_SCHEDULE_READBACK_FAILED");
 assertScheduleUnchanged(scheduleAfter,baseline);
 return methodRequestId;
}

export async function cancelSubscriptionPaymentMethod(admin:SupabaseClient,salonId:string,attemptId:string) {
  if (!safeUuid(attemptId)) throw new UserSafeRequestError("The payment update attempt is invalid.",400);
  const result=await admin.from(table).select("stripe_checkout_session_id").eq("id",attemptId).eq("salon_id",salonId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.stripe_checkout_session_id) throw new UserSafeRequestError("This payment update could not be identified. No payment method was changed.",409);
  return completeSubscriptionPaymentMethod(admin,result.data.stripe_checkout_session_id,salonId,true);
}
