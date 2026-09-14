import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError, type AssistantTool } from "@/lib/gcAssistantCore";
import { ownerBusinessMetrics, profileCompletion } from "@/lib/ownerBusinessMetrics";
import { calendarAvailability } from "@/lib/bookingAvailabilityServer";
type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;

export async function readOwnerOperation(context: Context, tool: AssistantTool, args: Row): Promise<unknown> {
  const { admin, salon } = context;
  if (tool === "get_calendar_gaps" || tool === "get_availability") return calendarAvailability({ salonId: salon.id, date: String(args.date), stylistId: args.stylist_id ? String(args.stylist_id) : null });
  if (tool === "get_plan_status") {
    const result = await admin.from("subscriptions").select("tier,status,current_period_end,scheduled_tier,cancel_at_period_end").eq("salon_id", salon.id).maybeSingle();
    if (result.error) throw result.error;
    return { subscription: result.data, billing_changes_require_subscription_workflow: true };
  }
  if (tool === "get_profile_completion") {
    const counts = await Promise.all(["styles", "stylists"].map(table => admin.from(table).select("id", { count: "exact", head: true }).eq("salon_id", salon.id).is("archived_at", null)));
    for (const result of counts) if (result.error) throw result.error;
    return { profile_completion: profileCompletion(salon, counts[0].count || 0, counts[1].count || 0) };
  }
  if (tool === "get_booking_messages") {
    const booking = await admin.from("bookings").select("id,booking_origin,customer_id").eq("salon_id", salon.id).eq("id", args.booking_id).maybeSingle();
    if (booking.error) throw booking.error;
    if (!booking.data) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
    const messages = await admin.from("booking_messages").select("id,original_body,body,source_locale,sender_role,created_at", { count: "exact" }).eq("salon_id", salon.id).eq("booking_id", args.booking_id).order("created_at", { ascending: false }).limit(100);
    if (messages.error) throw messages.error;
    return { messages: messages.data, total: messages.count, capped_at: 100, customer_participant: Boolean(booking.data.customer_id) };
  }
  const lists: Partial<Record<AssistantTool, { table: string; fields: string; key: string; name?: string }>> = {
    get_professionals: { table: "stylists", fields: "id,name,bio,specialties,years_experience,is_active,is_draft,availability", key: "professionals", name: "name" },
    get_products: { table: "salon_products", fields: "id,name,description,price,sale_price,inventory_quantity,product_status,is_visible", key: "products", name: "name" },
    get_promotions: { table: "salon_promotions", fields: "id,title,description,promotion_type,discount_value,starts_at,ends_at,status,target_scope", key: "promotions" },
    get_reviews: { table: "reviews", fields: "id,rating_overall,written_review,salon_reply,display_name,moderation_status,created_at", key: "reviews" },
  };
  const list = lists[tool];
  if (list) {
    let query = admin.from(list.table).select(list.fields, { count: "exact" }).eq("salon_id", salon.id);
    if (list.table !== "reviews") query = query.is("archived_at", null);
    if (list.name) query = query.ilike(list.name, `%${String(args.query || "").replace(/[\\%_]/g, character => `\\${character}`)}%`);
    if (tool === "get_reviews") query = query.gte("created_at", args.start).lt("created_at", args.end);
    const result = await query.order("created_at", { ascending: false }).limit(100);
    if (result.error) throw result.error;
    return { [list.key]: result.data, total: result.count, capped_at: 100 };
  }
  if (["get_business_summary", "get_earnings_summary", "get_customers", "get_upcoming_appointments"].includes(tool)) {
    // Paginate authoritative bookings, as the existing finance ledger does.
    // Aggregate numeric facts stay server-side; private bodies are never sent to
    // the planner. A bounded range prevents unbounded historical requests.
    const bookings: Row[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await admin.from("bookings").select("id,public_reference,appointment_datetime,status,guest_name,guest_email,customer_id,estimated_total,cancelled_by,cancellation_initiated_by,booking_origin,source").eq("salon_id", salon.id).gte("appointment_datetime", args.start).lt("appointment_datetime", args.end).order("id").range(offset, offset + 999);
      if (result.error) throw result.error;
      bookings.push(...result.data || []);
      if ((result.data || []).length < 1000) break;
      if (offset >= 99000) throw new AssistantError("ASSISTANT_RANGE_TOO_LARGE", 409);
    }
    const metrics = ownerBusinessMetrics(bookings);
    if (tool === "get_customers") return { customers: bookings.map(row => ({ name: row.guest_name, booking_id: row.id, customer_id: row.customer_id, booking_origin: row.booking_origin })), scope: "customers_of_these_bookings" };
    if (tool === "get_upcoming_appointments") return { bookings: metrics.upcoming.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "guest_email"))), time_zone: salon.time_zone };
    if (tool === "get_earnings_summary") return { completed_booking_value: metrics.completed_booking_value, marketplace_bookings: metrics.marketplace_bookings, business_added_appointments: metrics.business_added_appointments, currency: "USD", definition: "Completed Booking Value", cash_revenue: null };
    const byStatus: Record<string, number> = {};
    for (const row of bookings) byStatus[String(row.status)] = (byStatus[String(row.status)] || 0) + 1;
    // Overview permission allows aggregates, not customer identities or contacts.
    const calendarDate = new Intl.DateTimeFormat("en-CA", { timeZone: String(salon.time_zone), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const calendar = await calendarAvailability({ salonId: salon.id, date: calendarDate });
    return { calendar_gaps: calendar, ...metrics, upcoming: metrics.upcoming.length, bookings: bookings.length, by_status: byStatus, profile_views: Number(salon.profile_views || 0), profile_views_period: "all_time", start: args.start, end: args.end, time_zone: salon.time_zone, customer_metric_definition: "Distinct customer identities or guest email addresses in this range", currency: "USD" };
  }
  throw new AssistantError("ASSISTANT_UNKNOWN_TOOL");
}
