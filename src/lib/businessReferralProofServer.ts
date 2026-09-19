import { randomUUID } from "node:crypto";
import type { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { referralPaymentEvidence } from "@/lib/referralPaymentEvidence";
type Admin = Pick<ReturnType<typeof getSupabaseAdmin>, "from" | "rpc">;
type ObjectValue = Record<string, unknown>;
type Reader = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<T>;
type EvidenceInput = Parameters<typeof referralPaymentEvidence>[0];
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
const id = (value: unknown) => typeof value === "string" ? value : String(object(value).id || "");

/** Optional enrichment must never hold the canonical invoice ledger hostage.
 * An existing claim is required even to attempt a provider read. Failures are
 * explicit unverified observations; owner refresh can recover them later. */
export async function optionalReferralPaymentEvidence(admin: Admin, input: EvidenceInput, get: Reader) {
 if (input.eventType !== "invoice.paid" || input.invoice.livemode !== true || !input.salonId) return null;
 try {
  const claim = await admin.from("business_referral_claims").select("id").eq("referred_salon_id", input.salonId).limit(1).maybeSingle();
  if (claim.error) return { source: "stripe_unverified_payment_v1", reason: "claim_lookup_unavailable" };
  if (!claim.data) return null;
  return await referralPaymentEvidence(input, get) || { source: "stripe_unverified_payment_v1", reason: "payment_review_required" };
 } catch {
  return { source: "stripe_unverified_payment_v1", reason: "provider_read_unavailable" };
 }
}

/** Protected owner route only. Inputs remain in this server function and are
 * never returned to an owner or the assistant. All provider operations are GET.
 * A generation token prevents an older response replacing a newer failed check.
 */
export async function refreshReferralPaymentChecks(admin: Admin, salonId: string, actorId: string, get: Reader) {
 const input = await admin.rpc("business_referral_check_inputs", { p_salon: salonId, p_actor: actorId });
 if (input.error) throw input.error;
 if (!Array.isArray(input.data) || input.data.length > 21) throw new Error("REFERRAL_INPUT_SCOPE_INVALID");
 const rows = input.data.slice(0,20).map(object);
 for (const row of rows) {
  if (!/^[0-9a-f-]{36}$/i.test(String(row.billing_event_id)) || !/^[0-9a-f-]{36}$/i.test(String(row.salon_id)) || !/^in_[A-Za-z0-9]+$/.test(String(row.stripe_invoice_id)) || !/^sub_[A-Za-z0-9]+$/.test(String(row.stripe_subscription_id)) || !/^cus_[A-Za-z0-9]+$/.test(String(row.stripe_customer_id)) || !Number.isSafeInteger(Number(row.amount_collected)) || Number(row.amount_collected)<=0 || row.currency!=="usd") throw new Error("REFERRAL_INPUT_SCOPE_INVALID");
 }
 if (!rows.length) return { checked: 0, pending: false };
 const generation = randomUUID(), checkedAt = new Date().toISOString();
 const reset = await admin.from("business_referral_payment_checks").upsert(rows.map(row => ({ billing_event_id: row.billing_event_id, generation, checked_at: checkedAt, state: "unverified", proof: null, last_error: "REFERRAL_CHECK_PENDING" })), { onConflict: "billing_event_id" });
 if (reset.error) throw reset.error;
 const deadline = AbortSignal.timeout(40_000);
 const read: Reader = (path) => get(path, { signal: deadline });
 let next = 0, pending = input.data.length > 20;
 await Promise.all(Array.from({ length: Math.min(3, rows.length) }, async () => {
  while (next < rows.length) {
   const row = rows[next++];
   let proof: Awaited<ReturnType<typeof referralPaymentEvidence>> = null;
   let reason = "REFERRAL_PAYMENT_REVIEW";
   try {
    if (deadline.aborted) throw new Error("REFERRAL_CHECK_DEADLINE");
    const [invoice, subscription] = await Promise.all([
     read<ObjectValue>(`/invoices/${row.stripe_invoice_id}`), read<ObjectValue>(`/subscriptions/${row.stripe_subscription_id}`),
    ]);
    const invoiceSubscription = id(invoice.subscription) || id(object(object(invoice.parent).subscription_details).subscription);
    if (invoice.id === row.stripe_invoice_id && subscription.id === row.stripe_subscription_id && invoiceSubscription === row.stripe_subscription_id && Number(invoice.amount_paid) === Number(row.amount_collected) && invoice.currency === row.currency) {
     proof = await referralPaymentEvidence({ eventType: "invoice.paid", invoice, subscription, salonId: String(row.salon_id), stored: { salon_id: row.salon_id, stripe_subscription_id: row.stripe_subscription_id, stripe_customer_id: row.stripe_customer_id } }, read);
    }
   } catch { reason = "REFERRAL_CHECK_UNAVAILABLE"; }
   const saved = await admin.from("business_referral_payment_checks").update({ state: proof ? "verified" : "unverified", proof, checked_at: new Date().toISOString(), last_error: proof ? null : reason }).eq("billing_event_id", row.billing_event_id).eq("generation", generation).select("billing_event_id").maybeSingle();
   if (saved.error) throw saved.error;
   if (!proof || !saved.data) pending = true;
  }
 }));
 return { checked: rows.length, pending };
}
