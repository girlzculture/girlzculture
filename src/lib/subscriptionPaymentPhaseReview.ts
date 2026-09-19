import { createHash } from "node:crypto";

/**
 * Disconnected review preparation, never a Stripe transport or authorization gate.
 * Contract: stripe-node v18.3.0, types/SubscriptionSchedules{,Resource}.d.ts and
 * types/TaxRates.d.ts, https://github.com/stripe/stripe-node/tree/v18.3.0/types
 * https://docs.stripe.com/api/subscription_schedules/update?api-version=2025-06-30.basil
 * A complete phase replacement still needs durable original intent, fresh
 * preflight/readback, phase-transition guards, and real provider acceptance. A hash
 * detects changed input; it is not a Stripe revision precondition or proof of origin.
 */
export const PAYMENT_PHASE_REVIEW_API_VERSION = "2025-06-30.basil";
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Row = { [key: string]: Json };
type EmptyDiscountIntent = "inherit" | "none";
export type PaymentPhaseReviewInput = {
  source: unknown;
  apiVersion: string;
  customerId: string;
  subscriptionId: string;
  livemode: boolean;
  targetMethodId: string;
  now: number;
  /** Validation of a successful original request may contain inherited methods only. */
  allowUnchanged?: boolean;
  /** Must come from retained original request intent; never infer from empty GET arrays. */
  sourceIntent: { sourceFingerprint: string; emptyDiscounts: Record<string, EmptyDiscountIntent> };
};

function fail(code: string): never { throw new Error(`PAYMENT_PHASE_REVIEW_${code}`); }
function json(value: unknown, depth = 0, budget = { count: 0 }): Json {
  if (++budget.count > 20000 || depth > 16) fail("INPUT_LIMIT");
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    if (typeof value === "string" && value.length > 10000) fail("INPUT_LIMIT");
    return value as null | boolean | string;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 1000 || Reflect.ownKeys(value).length !== value.length + 1) fail("INVALID_JSON");
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("INVALID_JSON");
      return json(descriptor.value, depth + 1, budget);
    });
  }
  if (!value || typeof value !== "object") fail("INVALID_JSON");
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) fail("INVALID_JSON");
  const output: Row = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || ["__proto__", "prototype", "constructor"].includes(key)) fail("INVALID_JSON");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("INVALID_JSON");
    output[key] = json(descriptor.value, depth + 1, budget);
  }
  return output;
}
function canonical(value: Json): Json {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function fingerprint(value: Json) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export function paymentPhaseSourceFingerprint(source: unknown, apiVersion: string) {
  if (apiVersion !== PAYMENT_PHASE_REVIEW_API_VERSION) fail("API_VERSION");
  return fingerprint({ api_version: apiVersion, source: json(source) });
}
function row(value: Json | undefined, allowed: string, required = allowed): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INCOMPLETE_FIELD");
  const keys = allowed.split(" ").filter(Boolean);
  if (Object.keys(value).some(key => !keys.includes(key))) fail("UNSUPPORTED_FIELD");
  if (required.split(" ").filter(Boolean).some(key => !Object.hasOwn(value, key))) fail("INCOMPLETE_FIELD");
  return value;
}
function list(value: Json | undefined, maximum = 20): Json[] {
  if (!Array.isArray(value) || value.length > maximum) fail("INCOMPLETE_FIELD");
  return value;
}
function str(value: Json | undefined, maximum = 1000): string {
  if (typeof value !== "string" || value.length > maximum) fail("INCOMPLETE_FIELD");
  return value;
}
function id(value: Json | undefined, prefix: string): string {
  const result = str(value, 255);
  if (!new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(result)) fail("UNSUPPORTED_REFERENCE");
  return result;
}
function enumValue(value: Json | undefined, options: string[]): string {
  if (typeof value !== "string" || !options.includes(value)) fail("UNSUPPORTED_VALUE");
  return value;
}
function integer(value: Json | undefined, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) fail("INCOMPLETE_FIELD");
  return Number(value);
}
function boolean(value: Json | undefined): boolean {
  if (typeof value !== "boolean") fail("INCOMPLETE_FIELD");
  return value;
}
function percent(value: Json | undefined, twoDecimals = true): number {
  if (typeof value !== "number" || value < 0 || value > 100 || (twoDecimals && Math.abs(value * 100 - Math.round(value * 100)) > 0.000001)) fail("UNSUPPORTED_VALUE");
  return value;
}
function currency(value: Json | undefined): string {
  const result = str(value, 3); if (!/^[a-z]{3}$/.test(result)) fail("UNSUPPORTED_VALUE"); return result;
}
function metadata(value: Json | undefined): Row {
  if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).length > 50) fail("INCOMPLETE_FIELD");
  for (const [key, entry] of Object.entries(value)) {
    if (!key || key.length > 40 || /[\[\]]/.test(key)) fail("UNSUPPORTED_VALUE");
    str(entry, 500);
  }
  return value;
}
function optional<T extends Json>(value: Json | undefined, validate: (value: Json) => T): T | undefined {
  return value === null || value === undefined ? undefined : validate(value);
}
function put(target: Row, key: string, value: Json | undefined) { if (value !== undefined) target[key] = value; }
function party(value: Json): Row {
  const source = row(value, "type account", "type");
  const type = enumValue(source.type, ["self", "account"]);
  if (type === "self" && Object.hasOwn(source, "account")) fail("UNSUPPORTED_VALUE");
  return type === "account" ? { type, account: id(source.account, "acct") } : { type };
}
function automaticTax(value: Json): Row {
  const source = row(value, "disabled_reason enabled liability");
  // A disabled reason is read-only and cannot be preserved by resubmitting enabled.
  if (source.disabled_reason !== null) fail("UNREPRESENTABLE_TAX_STATE");
  const result: Row = { enabled: boolean(source.enabled) };
  put(result, "liability", optional(source.liability, party)); return result;
}
function thresholds(value: Json): Row {
  const source = row(value, "amount_gte reset_billing_cycle_anchor");
  const result: Row = {};
  put(result, "amount_gte", optional(source.amount_gte, value => integer(value, 1)));
  put(result, "reset_billing_cycle_anchor", optional(source.reset_billing_cycle_anchor, boolean));
  if (!Object.keys(result).length) fail("UNREPRESENTABLE_THRESHOLD");
  return result;
}
function transfer(value: Json): Row {
  const source = row(value, "amount_percent destination");
  const result: Row = { destination: id(source.destination, "acct") };
  put(result, "amount_percent", optional(source.amount_percent, percent)); return result;
}
function invoice(value: Json): Row {
  const source = row(value, "account_tax_ids days_until_due issuer");
  const result: Row = {};
  if (source.account_tax_ids !== null) {
    const ids = list(source.account_tax_ids).map(value => id(value, "txi"));
    result.account_tax_ids = ids.length ? ids : "";
  }
  put(result, "days_until_due", optional(source.days_until_due, integer));
  put(result, "issuer", optional(source.issuer, party)); return result;
}
function taxId(value: Json, livemode: boolean): string {
  const source = row(value, "id object active country created description display_name effective_percentage flat_amount inclusive jurisdiction jurisdiction_level livemode metadata percentage rate_type state tax_type");
  if (source.object !== "tax_rate" || source.livemode !== livemode) fail("TAX_IDENTITY");
  boolean(source.active); boolean(source.inclusive); integer(source.created);
  for (const key of ["country", "description", "jurisdiction", "state"]) optional(source[key], str);
  str(source.display_name); optional(source.effective_percentage, value => percent(value, false)); percent(source.percentage, false);
  optional(source.metadata, metadata);
  optional(source.jurisdiction_level, value => enumValue(value, ["city", "country", "county", "district", "multiple", "state"]));
  optional(source.rate_type, value => enumValue(value, ["flat_amount", "percentage"]));
  optional(source.tax_type, value => enumValue(value, ["amusement_tax", "communications_tax", "gst", "hst", "igst", "jct", "lease_tax", "pst", "qst", "retail_delivery_fee", "rst", "sales_tax", "service_tax", "vat"]));
  if (source.flat_amount !== null) {
    const flat = row(source.flat_amount, "amount currency"); integer(flat.amount, 1); currency(flat.currency);
  }
  return id(source.id, "txr");
}
function taxRates(value: Json, livemode: boolean): Json {
  const ids = list(value).map(entry => taxId(entry, livemode));
  if (new Set(ids).size !== ids.length) fail("DUPLICATE_TAX");
  return ids.length ? ids : "";
}
type MappingContext = { livemode: boolean; intents: Record<string, EmptyDiscountIntent>; used: Set<string>; past?: boolean };
function discounts(value: Json, path: string, context: MappingContext, oneOff = false): Json | undefined {
  const values = list(value);
  if (!values.length) {
    if (oneOff || context.past) return undefined;
    const intent = context.intents[path];
    if (intent !== "inherit" && intent !== "none") fail("DISCOUNT_INTENT_REQUIRED");
    context.used.add(path);
    return intent === "none" ? "" : undefined;
  }
  return values.map(value => {
    const source = row(value, "coupon discount promotion_code");
    const set = Object.keys(source).filter(key => source[key] !== null);
    if (set.length !== 1) fail("AMBIGUOUS_DISCOUNT");
    const key = set[0];
    // Coupon IDs need not have a Stripe prefix. Never recreate an expanded object.
    const reference = key === "coupon" ? str(source[key], 255) : id(source[key], key === "discount" ? "di" : "promo");
    if (!reference || /[\s\[\]]/.test(reference)) fail("UNSUPPORTED_REFERENCE");
    return { [key]: reference };
  });
}
function item(value: Json, path: string, context: MappingContext, oneOff = false): Row {
  const source = row(value, oneOff ? "discounts price quantity tax_rates" : "billing_thresholds discounts metadata plan price quantity tax_rates", oneOff ? "discounts price quantity" : "billing_thresholds discounts metadata plan price");
  const price = id(source.price, "price");
  const result: Row = { price };
  if (!oneOff) {
    if (id(source.plan, "price") !== price) fail("PLAN_PRICE_MISMATCH");
    if (source.billing_thresholds !== null) {
      const threshold = row(source.billing_thresholds, "usage_gte");
      result.billing_thresholds = { usage_gte: integer(threshold.usage_gte, 1) };
    }
    put(result, "metadata", optional(source.metadata, metadata));
  }
  // Metered recurring items may omit quantity. A null one-off quantity cannot be
  // round-tripped as a request number without guessing the provider's normalization.
  if (Object.hasOwn(source, "quantity")) result.quantity = integer(source.quantity, 1);
  put(result, "discounts", discounts(source.discounts, `${path}.discounts`, context, oneOff));
  put(result, "tax_rates", optional(source.tax_rates, value => taxRates(value, context.livemode)));
  return result;
}
const defaultFields = "application_fee_percent automatic_tax billing_cycle_anchor billing_thresholds collection_method default_payment_method description invoice_settings on_behalf_of transfer_data";
const requiredDefaults = defaultFields.replace(" automatic_tax", "");
function settings(source: Row): Row {
  const result: Row = {};
  put(result, "application_fee_percent", optional(source.application_fee_percent, percent));
  if (Object.hasOwn(source, "automatic_tax")) result.automatic_tax = automaticTax(source.automatic_tax);
  put(result, "billing_cycle_anchor", optional(source.billing_cycle_anchor, value => enumValue(value, ["automatic", "phase_start"])));
  put(result, "billing_thresholds", optional(source.billing_thresholds, thresholds));
  put(result, "collection_method", optional(source.collection_method, value => enumValue(value, ["charge_automatically", "send_invoice"])));
  put(result, "description", optional(source.description, str));
  put(result, "invoice_settings", optional(source.invoice_settings, invoice));
  put(result, "on_behalf_of", optional(source.on_behalf_of, value => id(value, "acct")));
  put(result, "transfer_data", optional(source.transfer_data, transfer));
  optional(source.default_payment_method, value => id(value, "pm"));
  return result;
}
function phase(value: Json, index: number, context: MappingContext): Row {
  const extra = "add_invoice_items currency default_tax_rates discounts end_date items metadata proration_behavior start_date trial_end";
  const source = row(value, `${defaultFields} ${extra}`, `${requiredDefaults} ${extra.replace(" default_tax_rates", "")}`);
  const result = settings(source);
  result.start_date = integer(source.start_date);
  result.end_date = integer(source.end_date, Number(result.start_date) + 1);
  result.currency = currency(source.currency);
  result.proration_behavior = enumValue(source.proration_behavior, ["none", "create_prorations", "always_invoice"]);
  if (source.trial_end !== null) {
    const end = integer(source.trial_end, Number(source.start_date));
    if (end >= Number(source.end_date) || source.billing_cycle_anchor === "phase_start") fail("UNREPRESENTABLE_TRIAL");
    result.trial_end = end;
  }
  put(result, "metadata", optional(source.metadata, metadata));
  put(result, "default_tax_rates", optional(source.default_tax_rates, value => taxRates(value, context.livemode)));
  put(result, "discounts", discounts(source.discounts, `phases[${index}].discounts`, context));
  const items = list(source.items);
  if (!items.length) fail("INCOMPLETE_FIELD");
  result.items = items.map((value, itemIndex) => item(value, `phases[${index}].items[${itemIndex}]`, context));
  const additions = list(source.add_invoice_items);
  if (additions.length) result.add_invoice_items = additions.map((value, itemIndex) => item(value, `phases[${index}].add_invoice_items[${itemIndex}]`, context, true));
  return result;
}

export function preparePaymentPhaseReview(input: PaymentPhaseReviewInput) {
  if (input.apiVersion !== PAYMENT_PHASE_REVIEW_API_VERSION) fail("API_VERSION");
  const source = row(json(input.source), "id object application billing_mode canceled_at completed_at created current_phase customer default_settings end_behavior livemode metadata phases released_at released_subscription status subscription test_clock");
  const sourceFingerprint = paymentPhaseSourceFingerprint(source, input.apiVersion);
  if (input.sourceIntent?.sourceFingerprint !== sourceFingerprint) fail("SOURCE_INTENT_STALE");
  const intents = json(input.sourceIntent.emptyDiscounts);
  if (!intents || typeof intents !== "object" || Array.isArray(intents)) fail("DISCOUNT_INTENT_REQUIRED");
  if (Object.values(intents).some(value => value !== "inherit" && value !== "none")) fail("DISCOUNT_INTENT_REQUIRED");
  const context: MappingContext = { livemode: input.livemode, intents: intents as Record<string, EmptyDiscountIntent>, used: new Set() };
  id(source.id, "sub_sched"); id(input.customerId, "cus"); id(input.subscriptionId, "sub"); id(input.targetMethodId, "pm");
  if (source.object !== "subscription_schedule" || source.customer !== input.customerId || source.subscription !== input.subscriptionId || source.livemode !== boolean(input.livemode) || source.status !== "active") fail("IDENTITY_CONFLICT");
  for (const key of ["canceled_at", "completed_at", "released_at", "released_subscription"]) if (source[key] !== null) fail("INACTIVE_SCHEDULE");
  optional(source.application, value => id(value, "ca")); optional(source.test_clock, value => id(value, "clock")); integer(source.created); metadata(source.metadata);
  enumValue(source.end_behavior, ["release", "cancel", "none", "renew"]);
  const billing = row(source.billing_mode, "type updated_at", "type"); enumValue(billing.type, ["classic", "flexible"]);
  if (Object.hasOwn(billing, "updated_at")) integer(billing.updated_at);
  const defaults = row(source.default_settings, defaultFields, requiredDefaults); settings(defaults);
  enumValue(defaults.billing_cycle_anchor, ["automatic", "phase_start"]);
  const defaultInvoice = row(defaults.invoice_settings, "account_tax_ids days_until_due issuer"); party(defaultInvoice.issuer);
  const current = row(source.current_phase, "start_date end_date");
  const start = integer(current.start_date), end = integer(current.end_date, start + 1), now = integer(input.now);
  if (now < start || now >= end) fail("PHASE_TRANSITION");
  const phases = list(source.phases, 10);
  if (!phases.length) fail("INCOMPLETE_FIELD");
  const expected = json(source) as Row;
  const expectedPhases = expected.phases as Row[];
  const changedPaths: string[] = [];
  const inheritedPhaseIndices: number[] = [];
  const request: Row = { proration_behavior: "none", phases: [] };
  if (defaults.default_payment_method !== null) {
    request.default_settings = { default_payment_method: input.targetMethodId };
    (expected.default_settings as Row).default_payment_method = input.targetMethodId;
    if (defaults.default_payment_method !== input.targetMethodId) changedPaths.push("default_settings.default_payment_method");
  }
  let previousEnd: number | undefined, currentIndex = -1;
  phases.forEach((value, index) => {
    const sourcePhase = row(value, `${defaultFields} add_invoice_items currency default_tax_rates discounts end_date items metadata proration_behavior start_date trial_end`, "start_date end_date default_payment_method");
    const phaseStart = integer(sourcePhase.start_date), phaseEnd = integer(sourcePhase.end_date, phaseStart + 1);
    if (previousEnd !== undefined && previousEnd !== phaseStart) fail("PHASE_SEQUENCE");
    previousEnd = phaseEnd;
    if (phaseStart === start && phaseEnd === end) currentIndex = index;
    if (phaseEnd <= start) {
      phase(value, index, { ...context, past: true }); // Validate, but never send or alter past phases.
      return;
    }
    const mapped = phase(value, index, context);
    if (sourcePhase.default_payment_method !== null) {
      mapped.default_payment_method = input.targetMethodId;
      expectedPhases[index].default_payment_method = input.targetMethodId;
      if (sourcePhase.default_payment_method !== input.targetMethodId) changedPaths.push(`phases[${index}].default_payment_method`);
    } else inheritedPhaseIndices.push(index);
    (request.phases as Json[]).push(mapped);
  });
  if (currentIndex < 0 || (!changedPaths.length && input.allowUnchanged!==true)) fail(currentIndex < 0 ? "PHASE_SEQUENCE" : "NO_EXPLICIT_CHANGE");
  if (Object.keys(context.intents).some(path => !context.used.has(path))) fail("UNUSED_DISCOUNT_INTENT");
  return {
    api_version: PAYMENT_PHASE_REVIEW_API_VERSION,
    source_schema: "stripe-node@18.3.0",
    source_fingerprint: sourceFingerprint,
    source_intent: { sourceFingerprint, emptyDiscounts: canonical(intents) },
    request_fingerprint: fingerprint({ api_version: input.apiVersion, request }),
    expected_fingerprint: paymentPhaseSourceFingerprint(expected, input.apiVersion),
    application_ready: false as const,
    // An inherited null does not prove the underlying subscription/customer will
    // resolve to this method, especially when the schedule default is also null.
    effective_payment_methods_verified: false as const,
    inherited_phase_indices: inheritedPhaseIndices,
    inherited_schedule_default: defaults.default_payment_method === null,
    remaining_requirements: ["fresh_owner_and_method_customer_mode", "authoritative_current_subscription_and_effective_defaults", "durable_original_intent", "fresh_preflight_and_commercial_readback", "phase_transition_window", "durable_apply_recovery", "provider_acceptance_including_invoice_items"] as const,
    current_phase_index: currentIndex,
    changed_paths: changedPaths,
    request: canonical(request) as Row,
    expected_state: canonical(expected) as Row,
  };
}
