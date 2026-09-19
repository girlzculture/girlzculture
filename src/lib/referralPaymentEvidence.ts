type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const id = (value: unknown) => typeof value === "string" ? value : String(record(value).id || "");
type ReadProvider = <T>(path: string, options?: { signal?: AbortSignal }) => Promise<T>;

/** Called only after the existing signature verification and canonical billing
 * context resolution. Invoice.paid alone is insufficient: credits, out-of-band
 * marks and test events cannot qualify a live referral. No provider writes. */
export async function referralPaymentEvidence(input: { eventType: string; invoice: RecordValue; subscription: RecordValue | null; stored: RecordValue | null; salonId: string | null }, get: ReadProvider) {
  const { invoice, subscription, stored } = input;
  if (input.eventType !== "invoice.paid" || !subscription || !stored || invoice.livemode !== true || subscription.livemode !== true || invoice.status !== "paid" || invoice.paid_out_of_band === true || invoice.collection_method !== "charge_automatically") return null;
  const amount = Number(invoice.amount_paid), customer = id(invoice.customer), subscriptionId = id(subscription);
  if (!Number.isSafeInteger(amount) || amount <= 0 || !/^cus_[A-Za-z0-9]+$/.test(customer) || id(subscription.customer) !== customer || stored.stripe_customer_id !== customer || stored.stripe_subscription_id !== subscriptionId || stored.salon_id !== input.salonId || subscription.status !== "active") return null;
  let paymentId = id(invoice.payment_intent);
  if (!paymentId) {
    const payments = record(invoice.payments);
    if (payments.has_more === true || !Array.isArray(payments.data)) return null;
    const successful = payments.data.map(record).filter(row => row.status === "paid" && record(row.payment).type === "payment_intent");
    // Mixed/partial funding needs explicit review, never a guessed allocation.
    if (successful.length !== 1 || Number(successful[0].amount_paid) !== amount) return null;
    paymentId = id(record(successful[0].payment).payment_intent);
  }
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentId)) return null;
  const intent = record(await get(`/payment_intents/${paymentId}?expand[]=latest_charge`, { signal: AbortSignal.timeout(15_000) }));
  const charge = record(intent.latest_charge);
  // A capture is not a fraud clearance. A linked review requires explicit
  // billing review; do not infer clearance from an incomplete expanded object.
  if (record(charge.fraud_details).user_report === "fraudulent" || charge.review != null) return null;
  if (intent.id !== paymentId || intent.status !== "succeeded" || intent.livemode !== true || id(intent.customer) !== customer || Number(intent.amount_received) !== amount || intent.currency !== invoice.currency || charge.status !== "succeeded" || charge.paid !== true || charge.captured !== true || charge.livemode !== true || id(charge.customer) !== customer || id(charge.payment_intent) !== paymentId || charge.disputed !== false || Number(charge.amount_refunded) !== 0 || Number(charge.amount) !== amount || charge.currency !== invoice.currency || !/^ch_[A-Za-z0-9]+$/.test(id(charge))) return null;
  const paidAt = Number(record(invoice.status_transitions).paid_at), created = Number(subscription.created);
  if (!Number.isSafeInteger(paidAt) || paidAt <= 0 || !Number.isSafeInteger(created) || created <= 0) return null;
  return { source: "stripe_verified_payment_v1", livemode: true, customer_id: customer, payment_intent_id: paymentId, charge_id: id(charge), amount_cents: amount, subscription_status: "active", subscription_created_at: new Date(created * 1000).toISOString(), paid_at: new Date(paidAt * 1000).toISOString() };
}
