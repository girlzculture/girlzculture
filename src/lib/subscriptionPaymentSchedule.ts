import { createHash } from "node:crypto";
import { stripeIdentity } from "@/lib/subscriptionPaymentMethodCore";

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const scheduleKeys = new Set("id object application canceled_at completed_at created current_phase customer customer_account default_settings end_behavior livemode metadata phases released_at released_subscription renewal_interval status subscription test_clock billing_mode".split(" "));
const phaseKeys = new Set("add_invoice_items application_fee_percent automatic_tax billing_cycle_anchor billing_thresholds collection_method currency default_payment_method default_source default_tax_rates description discounts end_date invoice_settings items metadata on_behalf_of proration_behavior start_date transfer_data trial_end trial billing_mode".split(" "));
const defaultKeys = new Set("application_fee_percent automatic_tax billing_cycle_anchor billing_thresholds collection_method default_payment_method default_source description invoice_settings on_behalf_of transfer_data billing_mode".split(" "));
const itemKeys=new Set("price plan quantity tax_rates discounts metadata billing_thresholds".split(" "));
function known(record: RecordValue, keys: Set<string>) { if (Object.keys(record).some(key => !keys.has(key))) throw new Error("PAYMENT_SCHEDULE_UNSUPPORTED_FIELD"); }
function canonical(value: unknown): unknown {
 if (Array.isArray(value)) return value.map(canonical);
 if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
 return value;
}
export function scheduleFingerprint(schedule: RecordValue) {
 const copy=structuredClone(schedule); delete object(copy.default_settings).default_payment_method;
 return createHash("sha256").update(JSON.stringify(canonical(copy))).digest("hex");
}
export function subscriptionFingerprint(subscription: RecordValue) {
 const copy=structuredClone(subscription);delete copy.default_payment_method;
 copy.customer=stripeIdentity(copy.customer as Parameters<typeof stripeIdentity>[0]);
 return createHash("sha256").update(JSON.stringify(canonical(copy))).digest("hex");
}
export type PaymentScheduleBaseline={ schedule:RecordValue; fingerprint:string; subscription_fingerprint:string; default_method:string|null };
export function inspectInheritedSchedule(value:unknown, subscription:RecordValue, customerId:string, livemode:boolean):PaymentScheduleBaseline {
 const schedule=object(value), defaults=object(schedule.default_settings), current=object(schedule.current_phase);
 known(schedule,scheduleKeys);known(defaults,defaultKeys);
 known(current,new Set(['start_date','end_date']));
 if (schedule.object!=="subscription_schedule" || schedule.id!==stripeIdentity(subscription.schedule as Parameters<typeof stripeIdentity>[0]) || schedule.subscription!==subscription.id || schedule.customer!==customerId || schedule.livemode!==livemode || schedule.status!=="active" || !Number.isSafeInteger(current.start_date) || !Number.isSafeInteger(current.end_date) || Number(current.end_date)<=Number(current.start_date) || !Array.isArray(schedule.phases) || schedule.phases.length<1 || schedule.phases.length>10 || !Object.hasOwn(defaults,"default_payment_method")) throw new Error("PAYMENT_SCHEDULE_IDENTITY_CONFLICT");
 if (defaults.default_source || (defaults.default_payment_method!==null && (typeof defaults.default_payment_method!=="string" || !/^pm_[A-Za-z0-9_]+$/.test(defaults.default_payment_method)))) throw new Error("PAYMENT_SCHEDULE_EXPLICIT_OVERRIDE");
 let currentFound=false,previousEnd:number|null=null;
 for(const value of schedule.phases){
  const phase=object(value);known(phase,phaseKeys);
  if(!Number.isSafeInteger(phase.start_date)||!Number.isSafeInteger(phase.end_date)||Number(phase.end_date)<=Number(phase.start_date)||(previousEnd!==null&&previousEnd!==phase.start_date)||!Array.isArray(phase.items)||!phase.items.length)throw new Error("PAYMENT_SCHEDULE_INCOMPLETE_PHASES");
  previousEnd=Number(phase.end_date);
  for(const itemValue of phase.items){const item=object(itemValue);known(item,itemKeys);if(typeof item.price!=='string'||!/^price_[A-Za-z0-9_]+$/.test(item.price)||!Number.isSafeInteger(item.quantity)||Number(item.quantity)<1)throw new Error('PAYMENT_SCHEDULE_INCOMPLETE_PHASES');}
  if(phase.start_date===current.start_date&&phase.end_date===current.end_date)currentFound=true;
  if(Number(phase.end_date)>Number(current.start_date)&&(!Object.hasOwn(phase,"default_payment_method")||phase.default_payment_method!==null||phase.default_source))throw new Error("PAYMENT_SCHEDULE_EXPLICIT_OVERRIDE");
 }
 if(!currentFound)throw new Error("PAYMENT_SCHEDULE_INCOMPLETE_PHASES");
 return {schedule:structuredClone(schedule),fingerprint:scheduleFingerprint(schedule),subscription_fingerprint:subscriptionFingerprint(subscription),default_method:defaults.default_payment_method as string|null};
}
export function assertScheduleUnchanged(current:PaymentScheduleBaseline, baseline:PaymentScheduleBaseline) {
 if(current.fingerprint!==baseline.fingerprint||current.subscription_fingerprint!==baseline.subscription_fingerprint)throw new Error("PAYMENT_SCHEDULE_BASELINE_CHANGED");
}
export function scheduleMethodPayload(methodId:string) {
 if(!/^pm_[A-Za-z0-9_]+$/.test(methodId))throw new Error("PAYMENT_SCHEDULE_METHOD_INVALID");
 return {"default_settings[default_payment_method]":methodId};
}
