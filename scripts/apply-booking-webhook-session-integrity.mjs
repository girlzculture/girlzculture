import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/api/stripe/webhook/route.ts";
let source = readFileSync(path, "utf8");

function replaceOnce(before, after) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`Missing expected webhook source: ${before.slice(0, 160)}`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected one webhook source match: ${before.slice(0, 160)}`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

const oldStart = [
  'async function completeBookingCheckout(session: StripeObject, request: Request) {',
  '  if (session.metadata?.type !== "booking_deposit" || !["paid", "no_payment_required"].includes(String(session.payment_status))) return;',
  '  const admin = getSupabaseAdmin();',
  '  const intentId = session.metadata.booking_intent_id;',
  '  if (!intentId) return;',
  '  const { data: intent } = await admin.from("booking_checkout_intents").select("*").eq("id", intentId).single();',
  '  if (!intent || intent.status === "Paid") return;',
  '  const paymentIntentId = stripeId(session.payment_intent);',
].join("\n");

const newStart = [
  'async function completeBookingCheckout(session: StripeObject, request: Request) {',
  '  if (session.metadata?.type !== "booking_deposit" || !["paid", "no_payment_required"].includes(String(session.payment_status))) return;',
  '  if (!session.id) throw new Error("STRIPE_CHECKOUT_SESSION_ID_MISSING");',
  '  const admin = getSupabaseAdmin();',
  '  const intentId = session.metadata.booking_intent_id;',
  '  if (!intentId) return;',
  '  const { data: intent, error: intentError } = await admin',
  '    .from("booking_checkout_intents")',
  '    .select("*")',
  '    .eq("id", intentId)',
  '    .single();',
  '  if (intentError) throw intentError;',
  '  if (!intent) return;',
  '',
  '  const attachedSessionId = String(intent.stripe_checkout_session_id || "").trim();',
  '  if (attachedSessionId && attachedSessionId !== session.id) {',
  '    throw new Error("STRIPE_CHECKOUT_SESSION_MISMATCH");',
  '  }',
  '',
  '  let existingBookingId = String(intent.booking_id || "").trim();',
  '  if (!existingBookingId) {',
  '    const existing = await admin',
  '      .from("bookings")',
  '      .select("id")',
  '      .eq("stripe_checkout_session_id", session.id)',
  '      .maybeSingle();',
  '    if (existing.error) throw existing.error;',
  '    existingBookingId = String(existing.data?.id || "").trim();',
  '  }',
  '',
  '  if (existingBookingId) {',
  '    const intentUpdate = await admin',
  '      .from("booking_checkout_intents")',
  '      .update({',
  '        status: "Paid",',
  '        booking_id: existingBookingId,',
  '        stripe_checkout_session_id: session.id,',
  '      })',
  '      .eq("id", intent.id);',
  '    if (intentUpdate.error) throw intentUpdate.error;',
  '    try {',
  '      await deliverBookingNotifications(existingBookingId);',
  '    } catch (notificationError) {',
  '      await capturePlatformError({',
  '        request,',
  '        admin,',
  '        error: notificationError,',
  '        feature: "stripe-webhooks",',
  '        action: "retry-paid-booking-notifications",',
  '        actorRole: "provider",',
  '        salonId:',
  '          String((intent.payload as Record<string, unknown>)?.salon_id || "") ||',
  '          null,',
  '        recordType: "booking",',
  '        recordId: existingBookingId,',
  '        provider: "transactional-notifications",',
  '        safeMessage:',
  '          "The payment and booking are recorded, but one booking notification still needs attention.",',
  '      });',
  '    }',
  '    return;',
  '  }',
  '',
  '  if (intent.status === "Paid") {',
  '    throw new Error("PAID_BOOKING_INTENT_WITHOUT_BOOKING");',
  '  }',
  '  if (intent.status !== "Pending") {',
  '    await capturePlatformError({',
  '      request,',
  '      admin,',
  '      error: new Error(`PAID_CHECKOUT_AFTER_${String(intent.status || "UNKNOWN").toUpperCase()}`),',
  '      feature: "stripe-webhooks",',
  '      action: "recover-paid-closed-booking-intent",',
  '      actorRole: "provider",',
  '      salonId:',
  '        String((intent.payload as Record<string, unknown>)?.salon_id || "") ||',
  '        null,',
  '      recordType: "booking_checkout_intent",',
  '      recordId: intentId,',
  '      provider: "stripe",',
  '      safeMessage:',
  '        "Stripe confirmed payment after the local checkout hold had closed. Booking recovery is being attempted.",',
  '    });',
  '  }',
  '  const paymentIntentId = stripeId(session.payment_intent);',
].join("\n");

replaceOnce(oldStart, newStart);

const oldFinalize = [
  '  const { data: booking, error } = await admin.from("bookings").insert(payload).select("id").single();',
  '  if (error) throw error;',
  '  await admin.from("booking_checkout_intents").update({ status: "Paid", booking_id: booking.id }).eq("id", intent.id);',
].join("\n");

const newFinalize = [
  '  const { data: booking, error } = await admin',
  '    .from("bookings")',
  '    .insert(payload)',
  '    .select("id")',
  '    .single();',
  '  if (error) throw error;',
  '  const intentUpdate = await admin',
  '    .from("booking_checkout_intents")',
  '    .update({',
  '      status: "Paid",',
  '      booking_id: booking.id,',
  '      stripe_checkout_session_id: session.id,',
  '    })',
  '    .eq("id", intent.id);',
  '  if (intentUpdate.error) throw intentUpdate.error;',
].join("\n");

replaceOnce(oldFinalize, newFinalize);

writeFileSync(path, source);
console.log("Booking webhook session integrity patch applied.");
