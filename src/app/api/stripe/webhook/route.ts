import { normalizePlan, planFromStripePriceId, planRank, type SubscriptionPlan } from "@/lib/plans";
import { deliverBookingNotifications, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { stripeGet, verifyStripeEvent } from "@/lib/stripeServer";
import { normalizeUsState } from "@/lib/usStates";

type StripeLine = {
  amount?: number;
  price?: { id?: string };
  pricing?: { price_details?: { price?: string } };
  period?: { start?: number; end?: number };
};

type StripeObject = Record<string, unknown> & {
  id?: string;
  created?: number;
  metadata?: Record<string, string>;
  status?: string;
  customer?: string;
  subscription?: string | { id?: string };
  mode?: string;
  payment_status?: string;
  payment_intent?: string | { last_payment_error?: { message?: string } };
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  schedule?: string | { id?: string } | null;
  latest_invoice?: string | { id?: string } | null;
  invoice?: string | { id?: string };
  charge?: string | { id?: string };
  amount?: number;
  amount_paid?: number;
  amount_due?: number;
  currency?: string;
  billing_reason?: string;
  failure_message?: string;
  last_finalization_error?: { message?: string };
  parent?: { subscription_details?: { subscription?: string | { id?: string }; metadata?: Record<string, string> } };
  items?: { data?: Array<{ price?: { id?: string }; current_period_start?: number; current_period_end?: number }> };
  lines?: { data?: StripeLine[] };
  phases?: Array<{ start_date?: number; end_date?: number }>;
  discounts?: Array<{ coupon?: { id?: string } | string; promotion_code?: { id?: string } | string }>;
};

type StripeEvent = ReturnType<typeof verifyStripeEvent>;
type StoredSubscription = Record<string, unknown> & { salon_id?: string; tier?: string; scheduled_tier?: string; current_period_end?: string; cancellation_requested_at?: string; ended_at?: string; stripe_schedule_id?: string; last_invoice_id?: string };

function stripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String((value as { id?: unknown }).id || "") || null;
  return null;
}

function isoFromSeconds(value?: number) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function optionalPlan(value: unknown): SubscriptionPlan | null {
  return String(value || "").trim() ? normalizePlan(value) : null;
}

function invoicePriceId(invoice: StripeObject) {
  const lines = [...(invoice.lines?.data || [])].sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0));
  for (const line of lines) {
    const priceId = line.price?.id || line.pricing?.price_details?.price;
    if (priceId && planFromStripePriceId(priceId)) return priceId;
  }
  return null;
}

function planFromObject(object: StripeObject) {
  const priceId = object.items?.data?.[0]?.price?.id;
  return planFromStripePriceId(priceId) || normalizePlan(object.metadata?.plan);
}

async function syncSubscription(object: StripeObject) {
  const admin = getSupabaseAdmin();
  const salonId = object.metadata?.salon_id;
  if (!salonId || !object.id) return;
  const { data: existing } = await admin.from("subscriptions").select("*").eq("salon_id", salonId).maybeSingle();
  const plan = planFromObject(object);
  const status = String(object.status || "inactive");
  const subscriptionItem = object.items?.data?.[0];
  const periodStart = isoFromSeconds(object.current_period_start || subscriptionItem?.current_period_start) || existing?.current_period_start || null;
  const periodEnd = isoFromSeconds(object.current_period_end || subscriptionItem?.current_period_end);
  const scheduleId = stripeId(object.schedule) || existing?.stripe_schedule_id || null;
  const scheduledBecameEffective = Boolean(existing?.scheduled_tier && normalizePlan(existing.scheduled_tier) === plan);
  const cancellationRequestedAt = object.cancel_at_period_end ? (existing?.cancellation_requested_at || new Date().toISOString()) : null;
  const endedAt = ["canceled", "incomplete_expired"].includes(status.toLowerCase()) ? (existing?.ended_at || new Date().toISOString()) : null;
  const latestInvoiceId = stripeId(object.latest_invoice) || existing?.last_invoice_id || null;
  const { error: subscriptionError } = await admin.from("subscriptions").upsert({
    salon_id: salonId,
    tier: plan,
    status,
    stripe_subscription_id: object.id,
    stripe_customer_id: object.customer || null,
    price_id: object.items?.data?.[0]?.price?.id || null,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: Boolean(object.cancel_at_period_end),
    cancellation_requested_at: cancellationRequestedAt,
    ended_at: endedAt,
    stripe_schedule_id: scheduleId,
    scheduled_tier: scheduledBecameEffective ? null : existing?.scheduled_tier || null,
    scheduled_price_id: scheduledBecameEffective ? null : existing?.scheduled_price_id || null,
    scheduled_change_effective_at: scheduledBecameEffective ? null : existing?.scheduled_change_effective_at || null,
    last_invoice_id: latestInvoiceId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "salon_id" });
  if (subscriptionError) throw subscriptionError;
  const active = ["active", "trialing"].includes(status.toLowerCase());
  const { error: salonError } = await admin.from("salons").update({
    subscription_tier: plan,
    subscription_status: active ? status : "inactive",
    featured_weight: active ? (planRank(plan) === 3 ? 100 : planRank(plan) === 2 ? 40 : 0) : 0,
  }).eq("id", salonId);
  if (salonError) throw salonError;
}

async function syncScheduleState(object: StripeObject, eventType: string) {
  if (!object.id || !["subscription_schedule.completed", "subscription_schedule.released", "subscription_schedule.canceled"].includes(eventType)) return;
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("subscriptions").update({
    stripe_schedule_id: null,
    scheduled_tier: null,
    scheduled_price_id: null,
    scheduled_change_effective_at: null,
    updated_at: new Date().toISOString(),
  }).eq("stripe_schedule_id", object.id);
  if (error) throw error;
}

async function billingContext(object: StripeObject) {
  const admin = getSupabaseAdmin();
  let invoice: StripeObject | null = object.billing_reason ? object : null;
  let invoiceId = invoice?.id || stripeId(object.invoice);
  if (!invoiceId && stripeId(object.charge)) {
    const charge = await stripeGet<StripeObject>(`/charges/${stripeId(object.charge)}`);
    invoiceId = stripeId(charge.invoice);
  }
  if (!invoice && invoiceId) invoice = await stripeGet<StripeObject>(`/invoices/${invoiceId}?expand[]=subscription&expand[]=payment_intent`);

  let subscriptionId = stripeId(object.subscription) || stripeId(invoice?.subscription) || stripeId(invoice?.parent?.subscription_details?.subscription);
  let subscription: StripeObject | null = null;
  const objectLooksLikeSubscription = Boolean(object.items?.data && object.id && object.metadata);
  if (objectLooksLikeSubscription) {
    subscription = object;
    subscriptionId = object.id || subscriptionId;
  } else if (subscriptionId) {
    subscription = await stripeGet<StripeObject>(`/subscriptions/${subscriptionId}`);
  }

  let stored: StoredSubscription | null = null;
  if (subscriptionId) {
    const result = await admin.from("subscriptions").select("*").eq("stripe_subscription_id", subscriptionId).maybeSingle();
    stored = result.data as StoredSubscription | null;
  }
  if (!stored && invoiceId) {
    const result = await admin.from("subscriptions").select("*").eq("last_invoice_id", invoiceId).maybeSingle();
    stored = result.data as StoredSubscription | null;
  }
  const metadata = { ...(invoice?.parent?.subscription_details?.metadata || {}), ...(subscription?.metadata || {}), ...(object.metadata || {}) };
  const salonId = metadata.salon_id || stored?.salon_id || null;
  const { data: salon } = salonId ? await admin.from("salons").select("id,name,address_state,address_city,neighborhood").eq("id", salonId).maybeSingle() : { data: null };
  let state: string | null = null;
  if (salon?.address_state) {
    try { state = normalizeUsState(salon.address_state); }
    catch { state = String(salon.address_state).trim().toUpperCase() || null; }
  }
  const market = [salon?.address_city, salon?.neighborhood].filter(Boolean).join(" · ") || null;
  return { admin, invoice, invoiceId, subscription, subscriptionId, stored, metadata, salon, salonId, state, market };
}

async function recordBillingEvent(event: StripeEvent, object: StripeObject) {
  const supported = [
    "invoice.paid", "invoice.payment_failed", "subscription_schedule.updated",
    "customer.subscription.updated", "customer.subscription.deleted", "refund.created", "credit_note.created",
  ];
  if (!supported.includes(event.type)) return;
  const context = await billingContext(object);
  if (!context.salonId) {
    console.warn("Stripe financial event was not linked to a salon", { eventId: event.id, type: event.type, objectId: object.id });
    return;
  }

  const previous = event.data.previous_attributes || {};
  const invoicePlan = planFromStripePriceId(invoicePriceId(context.invoice || object));
  const currentPlan = context.subscription ? planFromObject(context.subscription) : optionalPlan(context.stored?.tier);
  const previousPlan = optionalPlan(context.metadata.previous_plan) || optionalPlan(context.stored?.tier) || currentPlan;
  const newPlan = optionalPlan(context.metadata.scheduled_plan) || optionalPlan(context.metadata.plan) || invoicePlan || currentPlan;
  const eventDate = new Date((event.created || object.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const paidThroughSeconds = Math.max(...((context.invoice?.lines?.data || []).map((line) => Number(line.period?.end || 0))), Number(context.subscription?.current_period_end || context.subscription?.items?.data?.[0]?.current_period_end || 0));
  const paidThrough = isoFromSeconds(paidThroughSeconds) || context.stored?.current_period_end || null;
  const failureReason = object.failure_message || object.last_finalization_error?.message || (typeof object.payment_intent === "object" ? object.payment_intent.last_payment_error?.message : null) || null;

  let eventType = "";
  let changeTiming: "immediate" | "scheduled" | null = null;
  let effectiveAt: string | null = null;
  let amountCollected = 0;
  let amountRefunded = 0;
  let amountCredited = 0;
  let paymentStatus = String(object.status || context.invoice?.status || "");
  let cancellationDate: string | null = null;

  if (event.type === "invoice.paid") {
    if (object.billing_reason === "subscription_create") eventType = "New subscription";
    else if (context.metadata.change_type === "upgrade" || object.billing_reason === "subscription_update") eventType = "Upgrade";
    else if (context.metadata.change_type === "downgrade_effective" || (context.stored?.scheduled_tier && newPlan === normalizePlan(context.stored.scheduled_tier))) eventType = "Downgrade became effective";
    else if (object.billing_reason === "subscription_cycle") eventType = "Renewal payment";
    else return;
    changeTiming = eventType === "Upgrade" || eventType === "New subscription" ? "immediate" : null;
    effectiveAt = eventType === "Downgrade became effective" ? eventDate : null;
    amountCollected = Number(object.amount_paid || 0);
    paymentStatus = "paid";
  } else if (event.type === "invoice.payment_failed") {
    eventType = object.billing_reason === "subscription_update" ? "Upgrade payment failed" : "Renewal failed";
    changeTiming = eventType === "Upgrade payment failed" ? "immediate" : null;
    paymentStatus = "failed";
  } else if (event.type === "subscription_schedule.updated") {
    if (!context.metadata.scheduled_plan || !("metadata" in previous)) return;
    eventType = "Downgrade scheduled";
    changeTiming = "scheduled";
    effectiveAt = isoFromSeconds(object.phases?.[1]?.start_date) || context.stored?.current_period_end || null;
    paymentStatus = "not_charged";
  } else if (event.type === "customer.subscription.updated") {
    const priorCancel = previous.cancel_at_period_end;
    if (object.cancel_at_period_end && priorCancel === false) {
      eventType = "Cancellation scheduled";
      changeTiming = "scheduled";
      effectiveAt = isoFromSeconds(object.current_period_end || object.items?.data?.[0]?.current_period_end);
      cancellationDate = effectiveAt;
      paymentStatus = "not_charged";
    } else if (!object.cancel_at_period_end && priorCancel === true) {
      eventType = "Reactivation";
      changeTiming = "immediate";
      effectiveAt = eventDate;
      paymentStatus = "active";
    } else return;
  } else if (event.type === "customer.subscription.deleted") {
    eventType = "Subscription ended";
    effectiveAt = eventDate;
    cancellationDate = eventDate;
    paymentStatus = "ended";
  } else if (event.type === "refund.created") {
    eventType = "Refund";
    amountRefunded = Number(object.amount || 0);
  } else if (event.type === "credit_note.created") {
    eventType = "Credit";
    amountCredited = Number(object.amount || 0);
    paymentStatus = String(object.status || "issued");
  }

  const { error } = await context.admin.from("billing_events").insert({
    salon_id: context.salonId,
    salon_name: context.salon?.name || null,
    state: context.state,
    market_snapshot: context.market,
    event_date: eventDate,
    event_type: eventType,
    previous_plan: previousPlan,
    new_plan: newPlan,
    change_timing: changeTiming,
    effective_at: effectiveAt,
    amount_collected: amountCollected,
    amount_refunded: amountRefunded,
    amount_credited: amountCredited,
    currency: String(object.currency || context.invoice?.currency || "usd").toLowerCase(),
    payment_status: paymentStatus || null,
    stripe_subscription_id: context.subscriptionId,
    stripe_invoice_id: context.invoiceId,
    stripe_event_id: event.id,
    failure_reason: failureReason,
    cancellation_date: cancellationDate,
    paid_through_date: paidThrough,
    metadata: { stripe_object_id: object.id || null, billing_reason: object.billing_reason || null },
  });
  if (error?.code === "23505") return;
  if (error) throw error;

  if (["invoice.paid", "invoice.payment_failed"].includes(event.type) && context.subscriptionId) {
    const pendingRequest = await context.admin.from("subscription_change_requests").select("id").eq("stripe_subscription_id", context.subscriptionId).eq("new_plan", newPlan).in("status", ["Awaiting confirmation", "Processing", "Requires action"]).order("requested_at", { ascending: false }).limit(1).maybeSingle();
    if (pendingRequest.error) throw pendingRequest.error;
    if (pendingRequest.data?.id) {
      const lines = context.invoice?.lines?.data || [];
      const prorationCredit = lines.filter((line) => Number(line.amount || 0) < 0).reduce((sum, line) => sum + Math.abs(Number(line.amount || 0)), 0);
      const prorationCharge = lines.filter((line) => Number(line.amount || 0) > 0).reduce((sum, line) => sum + Number(line.amount || 0), 0);
      const due = Number(context.invoice?.amount_due || 0);
      const collected = Number(context.invoice?.amount_paid || 0);
      const requestUpdate = await context.admin.from("subscription_change_requests").update({
        status: event.type === "invoice.paid" ? "Paid" : "Failed",
        effective_at: event.type === "invoice.paid" ? eventDate : null,
        event_source: "stripe_webhook",
        currency: String(context.invoice?.currency || object.currency || "usd").toLowerCase(),
        proration_credit: prorationCredit,
        proration_charge: prorationCharge,
        amount_due: due,
        amount_collected: collected,
        amount_pending: event.type === "invoice.paid" ? 0 : Math.max(0, due - collected),
        amount_failed: event.type === "invoice.payment_failed" ? due : 0,
        stripe_invoice_id: context.invoiceId,
        stripe_payment_reference: stripeId(context.invoice?.payment_intent),
        failure_reason: event.type === "invoice.payment_failed" ? failureReason || "Stripe reported that the invoice payment failed." : null,
        updated_at: new Date().toISOString(),
      }).eq("id", pendingRequest.data.id);
      if (requestUpdate.error) throw requestUpdate.error;
    }
  }

  if (context.subscriptionId && ["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
    const { error: stateError } = await context.admin.from("subscriptions").update({
      last_invoice_id: context.invoiceId,
      last_payment_status: paymentStatus || null,
      last_payment_failure: event.type === "invoice.payment_failed" ? failureReason || "Stripe payment failed." : null,
      updated_at: new Date().toISOString(),
    }).eq("stripe_subscription_id", context.subscriptionId);
    if (stateError) throw stateError;
  }
}

async function completeBookingCheckout(session: StripeObject) {
  if (session.metadata?.type !== "booking_deposit" || !["paid", "no_payment_required"].includes(String(session.payment_status))) return;
  const admin = getSupabaseAdmin();
  const intentId = session.metadata.booking_intent_id;
  if (!intentId) return;
  const { data: intent } = await admin.from("booking_checkout_intents").select("*").eq("id", intentId).single();
  if (!intent || intent.status === "Paid") return;
  const payload = { ...(intent.payload as Record<string, unknown>), stripe_payment_id: session.payment_intent || session.id, deposit_status: "Paid" };
  const { data: booking, error } = await admin.from("bookings").insert(payload).select("id").single();
  if (error) throw error;
  await admin.from("booking_checkout_intents").update({ status: "Paid", booking_id: booking.id }).eq("id", intent.id);
  await deliverBookingNotifications(booking.id).catch((notificationError) => console.error("Paid booking notification delivery failed", { bookingId: booking.id, notificationError }));
}

async function trackPromoRedemption(session: StripeObject) {
  if (!session.id) return;
  const admin = getSupabaseAdmin();
  if (session.metadata?.promo_redemption_id) {
    await admin.rpc("redeem_promo_code", { p_redemption_id: session.metadata.promo_redemption_id, p_checkout_session_id: session.id });
    return;
  }
  let details = session;
  if (!details.discounts?.length) details = await stripeGet<StripeObject>(`/checkout/sessions/${session.id}?expand[]=discounts.coupon&expand[]=discounts.promotion_code`);
  const discount = details.discounts?.[0];
  const promotionId = typeof discount?.promotion_code === "string" ? discount.promotion_code : discount?.promotion_code?.id;
  const couponId = typeof discount?.coupon === "string" ? discount.coupon : discount?.coupon?.id;
  if (!promotionId && !couponId) return;
  let query = admin.from("promo_codes").select("id");
  query = promotionId ? query.eq("stripe_promotion_code_id", promotionId) : query.eq("stripe_coupon_id", couponId as string);
  const { data: promo } = await query.maybeSingle();
  if (!promo) return;
  const purpose = session.mode === "subscription" ? "subscription" : "booking";
  let userId: string | null = null;
  if (purpose === "booking" && session.metadata?.booking_intent_id) {
    const { data: intent } = await admin.from("booking_checkout_intents").select("customer_id").eq("id", session.metadata.booking_intent_id).maybeSingle();
    userId = intent?.customer_id || null;
  }
  await admin.rpc("record_stripe_promo_redemption", { p_promo_code_id: promo.id, p_purpose: purpose, p_user_id: userId, p_salon_id: session.metadata?.salon_id || null, p_checkout_session_id: session.id });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: StripeEvent;
  try { event = verifyStripeEvent(rawBody, request.headers.get("stripe-signature")); }
  catch (error) { console.error("Stripe webhook signature failed", error); return Response.json({ error: "Invalid signature" }, { status: 400 }); }
  const admin = getSupabaseAdmin();
  const { error: dedupeError } = await admin.from("stripe_webhook_events").insert({ id: event.id, event_type: event.type });
  if (dedupeError?.code === "23505") return Response.json({ received: true, duplicate: true });
  if (dedupeError) { console.error("Stripe webhook dedupe failed", dedupeError); return Response.json({ error: "Webhook storage failed" }, { status: 500 }); }
  try {
    const object = event.data.object as StripeObject;
    await recordBillingEvent(event, object);
    if (event.type === "checkout.session.completed") {
      await trackPromoRedemption(object);
      await completeBookingCheckout(object);
      if (object.mode === "subscription" && object.subscription) {
        const subscription = await stripeGet<StripeObject>(`/subscriptions/${stripeId(object.subscription)}`);
        await syncSubscription(subscription);
      }
    }
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) await syncSubscription(object);
    if (event.type.startsWith("subscription_schedule.")) await syncScheduleState(object, event.type);
    return Response.json({ received: true });
  } catch (error) {
    await admin.from("stripe_webhook_events").delete().eq("id", event.id);
    console.error("Stripe webhook processing failed", { eventId: event.id, type: event.type, error });
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
