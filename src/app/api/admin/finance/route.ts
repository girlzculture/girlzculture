import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  bookingTransaction,
  collectEveryFinancePage,
} from "@/lib/financeLedgerCore";
import { publicErrorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

type Row = Record<string, unknown>;

async function GETHandler(request: Request) {
  try {
    const { admin, adminUser } = await requireAdminPermission(request, "finance");
    const salonId = new URL(request.url).searchParams.get("salon")?.trim() || "";
    if (
      salonId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        salonId,
      )
    ) {
      return Response.json(
        { error: "Choose a valid salon before opening its financial records." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const recordLimit = 2_000;
    let bookingsQuery = admin
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(recordLimit);
    let salonsQuery = admin
      .from("salons")
      .select("id,name,address_city,address_state")
      .order("name")
      .limit(2_000);
    let billingQuery = admin
      .from("billing_events")
      .select("*")
      .order("event_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(recordLimit);
    let changesQuery = admin
      .from("subscription_change_requests")
      .select("*")
      .order("requested_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(recordLimit);
    let productOrdersQuery = admin
      .from("product_orders")
      .select("*,items:product_order_items(*),events:product_order_events(*),refunds:product_order_refunds(*)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(recordLimit);
    let productRefundsQuery = admin
      .from("product_order_refunds")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(recordLimit);
    let stylesQuery = admin.from("styles").select("id,name").order("id").limit(2_000);
    let stylistsQuery = admin.from("stylists").select("id,name").order("id").limit(2_000);
    if (salonId) {
      bookingsQuery = bookingsQuery.eq("salon_id", salonId);
      salonsQuery = salonsQuery.eq("id", salonId);
      billingQuery = billingQuery.eq("salon_id", salonId);
      changesQuery = changesQuery.eq("salon_id", salonId);
      productOrdersQuery = productOrdersQuery.eq("salon_id", salonId);
      productRefundsQuery = productRefundsQuery.eq("salon_id", salonId);
      stylesQuery = stylesQuery.eq("salon_id", salonId);
      stylistsQuery = stylistsQuery.eq("salon_id", salonId);
    }
    const bookingsRequest = salonId
      ? collectEveryFinancePage<Row>((from, to) =>
          admin
            .from("bookings")
            .select("*")
            .eq("salon_id", salonId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        )
      : bookingsQuery;
    const billingRequest = salonId
      ? collectEveryFinancePage<Row>((from, to) =>
          admin
            .from("billing_events")
            .select("*")
            .eq("salon_id", salonId)
            .order("event_date", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        )
      : billingQuery;
    const changesRequest = salonId
      ? collectEveryFinancePage<Row>((from, to) =>
          admin
            .from("subscription_change_requests")
            .select("*")
            .eq("salon_id", salonId)
            .order("requested_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        )
      : changesQuery;
    const productOrdersRequest = salonId
      ? collectEveryFinancePage<Row>((from, to) =>
          admin
            .from("product_orders")
            .select("*,items:product_order_items(*),events:product_order_events(*),refunds:product_order_refunds(*)")
            .eq("salon_id", salonId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        )
      : productOrdersQuery;
    const productRefundsRequest = salonId
      ? collectEveryFinancePage<Row>((from, to) =>
          admin
            .from("product_order_refunds")
            .select("*")
            .eq("salon_id", salonId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        )
      : productRefundsQuery;
    const stylesRequest = salonId
      ? collectEveryFinancePage<Row>((from, to) =>
          admin
            .from("styles")
            .select("id,name")
            .eq("salon_id", salonId)
            .order("id")
            .range(from, to),
        )
      : stylesQuery;
    const stylistsRequest = salonId
      ? collectEveryFinancePage<Row>((from, to) =>
          admin
            .from("stylists")
            .select("id,name")
            .eq("salon_id", salonId)
            .order("id")
            .range(from, to),
        )
      : stylistsQuery;
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
    ] = await Promise.all([
      bookingsRequest,
      salonsQuery,
      stylesRequest,
      stylistsRequest,
      billingRequest,
      changesRequest,
      salonId
        ? Promise.resolve({ data: [], error: null })
        : admin.from("stripe_webhook_events").select("id,event_type,processed_at,provider_created_at,processing_status,attempt_count,last_attempt_at,error_reference,livemode").order("processed_at", { ascending: false }).limit(2000),
      productOrdersRequest,
      productRefundsRequest,
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
    ]) {
      if (result.error) throw result.error;
    }
    let bookingAuditsResult: { data: Row[] | null; error: unknown };
    if (salonId) {
      const bookingIds = ((bookingsResult.data || []) as Row[])
        .map((booking) => String(booking.id || ""))
        .filter(Boolean);
      const auditRows: Row[] = [];
      for (let index = 0; index < bookingIds.length; index += 100) {
        const bookingIdChunk = bookingIds.slice(index, index + 100);
        const chunkResult = await collectEveryFinancePage<Row>((from, to) =>
          admin
            .from("booking_audit_log")
            .select("booking_id,action,reason,actor_role,created_at")
            .in("booking_id", bookingIdChunk)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        );
        if (chunkResult.error) throw chunkResult.error;
        auditRows.push(...(chunkResult.data || []));
      }
      bookingAuditsResult = { data: auditRows, error: null };
    } else {
      bookingAuditsResult = await admin
        .from("booking_audit_log")
        .select("booking_id,action,reason,actor_role,created_at")
        .order("created_at", { ascending: false })
        .limit(5_000);
    }
    if (bookingAuditsResult.error) throw bookingAuditsResult.error;
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
