import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { bookingTransaction } from "@/lib/financeLedgerCore";
import { publicErrorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

type Row = Record<string, unknown>;

async function GETHandler(request: Request) {
  try {
    const { admin, adminUser } = await requireAdminPermission(request, "finance");
    const [
      bookingsResult,
      salonsResult,
      stylesResult,
      stylistsResult,
      billingResult,
      changesResult,
      webhookResult,
      productOrdersResult,
      productRefundsResult,
      bookingAuditsResult,
    ] = await Promise.all([
      admin.from("bookings").select("*").order("created_at", { ascending: false }).limit(2000),
      admin.from("salons").select("id,name,address_city,address_state").order("name").limit(2000),
      admin.from("styles").select("id,name").limit(5000),
      admin.from("stylists").select("id,name").limit(5000),
      admin.from("billing_events").select("*").order("event_date", { ascending: false }).limit(2000),
      admin.from("subscription_change_requests").select("*").order("requested_at", { ascending: false }).limit(1000),
      admin.from("stripe_webhook_events").select("id,event_type,processed_at,provider_created_at,processing_status,attempt_count,last_attempt_at,error_reference,livemode").order("processed_at", { ascending: false }).limit(2000),
      admin.from("product_orders").select("*,items:product_order_items(*),events:product_order_events(*),refunds:product_order_refunds(*)").order("created_at", { ascending: false }).limit(2000),
      admin.from("product_order_refunds").select("*").order("created_at", { ascending: false }).limit(2000),
      admin.from("booking_audit_log").select("booking_id,action,reason,actor_role,created_at").order("created_at", { ascending: false }).limit(5000),
    ]);
    for (const result of [
      bookingsResult,
      salonsResult,
      stylesResult,
      stylistsResult,
      billingResult,
      changesResult,
      webhookResult,
      productOrdersResult,
      productRefundsResult,
      bookingAuditsResult,
    ]) {
      if (result.error) throw result.error;
    }
    const salons = new Map(
      ((salonsResult.data || []) as Row[]).map((row) => [String(row.id), row]),
    );
    const styles = new Map(
      ((stylesResult.data || []) as Row[]).map((row) => [String(row.id), row]),
    );
    const stylists = new Map(
      ((stylistsResult.data || []) as Row[]).map((row) => [String(row.id), row]),
    );
    const bookingAudits = new Map<string, Row[]>();
    for (const audit of (bookingAuditsResult.data || []) as Row[]) {
      const bookingId = String(audit.booking_id || "");
      if (!bookingId) continue;
      const rows = bookingAudits.get(bookingId) || [];
      if (rows.length < 25) rows.push(audit);
      bookingAudits.set(bookingId, rows);
    }
    const bookingTransactions = ((bookingsResult.data || []) as Row[]).map(
      (booking) => ({
        ...bookingTransaction(
          booking,
          salons.get(String(booking.salon_id)),
          styles.get(String(booking.style_id)),
          stylists.get(String(booking.stylist_id)),
        ),
        audit_history: bookingAudits.get(String(booking.id)) || [],
      }),
    );
    return Response.json(
      {
        booking_transactions: bookingTransactions,
        billing_events: billingResult.data || [],
        subscription_change_requests: changesResult.data || [],
        stripe_events: webhookResult.data || [],
        salons: salonsResult.data || [],
        product_orders: productOrdersResult.data || [],
        product_refunds: productRefundsResult.data || [],
        admin_time_zone:
          String((adminUser as { time_zone?: string }).time_zone || "") ||
          "America/New_York",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return publicErrorResponse(
      error,
      "The finance ledger could not be loaded. Try again or contact support.",
    );
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/finance", "GET", {
    classification: "protected",
    feature: "finance-reconciliation",
    actorRole: "admin",
    safeMessage: "The protected finance ledger could not be loaded.",
  }),
  GETHandler,
);
