import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { capturePlatformError } from "@/lib/platformErrors";

async function GETHandler(request: Request) {
  const sessionId =
    new URL(request.url).searchParams.get("session_id") || "";
  if (!sessionId.startsWith("cs_"))
    return Response.json(
      { error: "Invalid checkout session." },
      { status: 400 },
    );
  const admin = getSupabaseAdmin();
  try {
    const { data: intent, error: intentError } = await admin
      .from("commerce_checkout_intents")
      .select("status,order_id,booking_id")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    if (intentError) throw intentError;
    if (!intent) return Response.json({ status: "Pending" });
    const [orderResult, bookingResult] = await Promise.all([
      intent.order_id
        ? admin
            .from("product_orders")
            .select(
              "public_reference,payment_status,fulfillment_status,total_amount,fulfillment_method",
            )
            .eq("id", intent.order_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
      intent.booking_id
        ? admin
            .from("bookings")
            .select(
              "public_reference,confirmation_code,status,appointment_datetime",
            )
            .eq("id", intent.booking_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (bookingResult.error) throw bookingResult.error;
    return Response.json({
      status: intent.status,
      order: orderResult.data,
      booking: bookingResult.data,
    });
  } catch (error) {
    const reference = await capturePlatformError({
      request,
      admin,
      error,
      feature: "product-commerce",
      action: "load-commerce-status",
      actorRole: "customer",
      provider: "supabase",
      safeMessage: "We couldn't confirm the order status.",
    });
    return Response.json(
      {
        error: `We couldn't confirm the order status. Reference ${reference}.`,
        request_id: reference,
      },
      { status: 500 },
    );
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/stripe/commerce-status", "GET", {
    classification: "public-read-only",
    feature: "product-commerce",
    actorRole: "customer",
    safeMessage: "The order status could not be loaded.",
  }),
  GETHandler,
);
