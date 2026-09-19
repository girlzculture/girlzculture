import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError, type AssistantTool } from "@/lib/gcAssistantCore";
import { ownerBusinessMetrics, profileCompletion } from "@/lib/ownerBusinessMetrics";
import { calendarAvailability } from "@/lib/bookingAvailabilityServer";
import { canonicalPlanForStored, restrictivePlanForLimits, SUBSCRIPTION_PLANS } from "@/lib/plans";
import { assistantPeriodMetrics, assistantPerformanceGroups, compareAssistantPeriods } from "@/lib/assistantPerformance";
import { readBusinessFinances } from "@/lib/businessFinanceServer";
import { assistantAssignedProfessional, assistantRequestedProfessional } from "@/lib/assistantProfessionalScope";
import { productStock } from "@/lib/businessProductInventory";
import { recordedSubscriptionMonthlyAmount } from "@/lib/subscriptionAgreement";
type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;

export async function readOwnerOperation(context: Context, tool: AssistantTool, args: Row): Promise<unknown> {
  const { admin, salon } = context;
  const assigned = assistantAssignedProfessional(context);
  if (tool === "get_earnings_summary") {
    const timeZone = String(salon.time_zone || "America/New_York");
    const day = (instant: number) => {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
      return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
    };
    const result = await readBusinessFinances(context, { from: day(Date.parse(String(args.start))), to: day(Date.parse(String(args.end)) - 1), timeZone });
    // Keep individual receipt IDs, client identities and raw books out of model
    // context. A stylist's protected RPC contains only their own earnings.
    const { balances, by_stylist, compensation_position, ...summary } = result.summary;
    const names = new Map(result.stylists.map(row => [String(row.id), String(row.name)]));
    return { scope: result.scope.kind === "own" ? "own_stylist_only" : "authenticated_business_only", scope_stylist_id: result.scope.stylist_id, ...summary,
      unpaid_balance_cents: balances.reduce((sum, row) => sum + row.unpaid_cents, 0),
      professional_earnings: Object.entries(by_stylist).map(([id, values]) => ({ name: names.get(id) || null, ...values })), evidence: result.evidence, insights: result.scope.kind === "business" ? result.insights : null,
      compensation_position: Object.entries(compensation_position).map(([id,values]) => ({ name:names.get(id)||null,...values })),
      definitions: "Integer cents in USD. Completed sales, receipts, costs, earned compensation and payouts are separate. Payments taken outside the app are recorded, not provider-processed. Recorded profit is not an exact margin when costs or expenses are incomplete." };
  }
  if (tool === "get_calendar_gaps" || tool === "get_availability") return calendarAvailability({ salonId: salon.id, date: String(args.date), stylistId: assistantRequestedProfessional(context, args.stylist_id) });
  if (tool === "get_plan_status") {
    const result = await admin.from("subscriptions").select("tier,status,current_period_end,scheduled_tier,cancel_at_period_end,price_id,recurring_price_snapshot").eq("salon_id", salon.id).maybeSingle();
    if (result.error) throw result.error;
    const current = canonicalPlanForStored(result.data?.tier);
    const recordedMonthlyAmount = recordedSubscriptionMonthlyAmount(result.data || {});
    const recordLimitPlan = restrictivePlanForLimits(result.data?.tier, result.data?.scheduled_tier);
    const catalog = Object.values(SUBSCRIPTION_PLANS).map(plan => ({ name: plan.name, monthly_amount_cents: plan.monthlyAmountCents, currency: "USD", entitlements: plan.entitlements }));
    async function usage(permission: "products" | "promotions") {
      const access = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: context.user.id, p_permission: permission });
      if (access.error) throw access.error;
      if (access.data !== true) return null;
      // Same record definitions as validateSalonRecordEntitlements; do not
      // expose even aggregate product/promotion data to an unauthorized team.
      let query = admin.from(permission === "products" ? "salon_products" : "salon_promotions")
        .select("id", { count: "exact", head: true }).eq("salon_id", salon.id).is("archived_at", null);
      query = permission === "products" ? query.neq("product_status", "Archived") : query.eq("status", "Active").eq("is_active", true);
      const counted = await query;
      if (counted.error) throw counted.error;
      return Number.isInteger(counted.count) ? counted.count : null;
    }
    const [productListings, activePromotions] = await Promise.all([usage("products"), usage("promotions")]);
    return {
      subscription: result.data ? { tier: result.data.tier, status: result.data.status, current_period_end: result.data.current_period_end, scheduled_tier: result.data.scheduled_tier, cancel_at_period_end: result.data.cancel_at_period_end } : null,
      current_plan: current ? { name: current, entitlements: SUBSCRIPTION_PLANS[current].entitlements, monthly_amount_cents: recordedMonthlyAmount === null ? null : Math.round(recordedMonthlyAmount * 100), currency: "USD", amount_basis: "Recorded provider base price before discounts and tax; unknown is not the new-sale catalog price." } : null,
      available_plans: catalog,
      effective_record_limit_plan: recordLimitPlan,
      // Match the existing inventory admission rule for pending downgrades.
      effective_record_limits: recordLimitPlan ? { product_listings: SUBSCRIPTION_PLANS[recordLimitPlan].entitlements.productListings, active_promotions: SUBSCRIPTION_PLANS[recordLimitPlan].entitlements.customerPromotions } : null,
      business_usage: { product_listings: productListings, active_promotions: activePromotions, as_of: new Date().toISOString() },
      revenue_uplift_projection: null,
      billing_changes_require_subscription_workflow: true,
    };
  }
  if (tool === "get_profile_completion") {
    const counts = await Promise.all(["styles", "stylists"].map(table => admin.from(table).select("id", { count: "exact", head: true }).eq("salon_id", salon.id).is("archived_at", null)));
    for (const result of counts) if (result.error) throw result.error;
    return { profile_completion: profileCompletion(salon, counts[0].count || 0, counts[1].count || 0) };
  }
  if (tool === "get_booking_messages") {
    let query = admin.from("bookings").select("id,booking_origin,customer_id").eq("salon_id", salon.id).eq("id", args.booking_id);
    if (assigned) query = query.eq("stylist_id", assigned);
    const booking = await query.maybeSingle();
    if (booking.error) throw booking.error;
    if (!booking.data) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
    const messages = await admin.from("booking_messages").select("id,original_body,body,source_locale,sender_role,created_at", { count: "exact" }).eq("salon_id", salon.id).eq("booking_id", args.booking_id).order("created_at", { ascending: false }).limit(100);
    if (messages.error) throw messages.error;
    return { messages: messages.data, total: messages.count, capped_at: 100, customer_participant: Boolean(booking.data.customer_id) };
  }
  const lists: Partial<Record<AssistantTool, { table: string; fields: string; key: string; name?: string }>> = {
    get_professionals: { table: "stylists", fields: "id,name,bio,specialties,years_experience,is_active,is_draft,availability", key: "professionals", name: "name" },
    get_products: { table: "salon_products", fields: "id,name,description,price,sale_price,inventory_quantity,track_inventory,low_stock_threshold,product_status,is_visible", key: "products", name: "name" },
    get_promotions: { table: "salon_promotions", fields: "id,title,description,promotion_type,discount_value,starts_at,ends_at,status,target_scope", key: "promotions" },
    get_reviews: { table: "reviews", fields: "id,rating_overall,written_review,salon_reply,display_name,moderation_status,created_at", key: "reviews" },
  };
  const list = lists[tool];
  if (list) {
    const canReadAssignments = tool === "get_professionals" && (context.isOwner || context.teamMember?.permissions?.styles === true);
    let query = admin.from(list.table).select(list.fields + (canReadAssignments ? ",assigned_service_ids" : ""), { count: "exact" }).eq("salon_id", salon.id);
    if (list.table !== "reviews") query = query.is("archived_at", null);
    if (list.name) query = query.ilike(list.name, `%${String(args.query || "").replace(/[\\%_]/g, character => `\\${character}`)}%`);
    if (tool === "get_reviews") query = query.gte("created_at", args.start).lt("created_at", args.end);
    const result = await query.order("created_at", { ascending: false }).limit(100);
    if (result.error) throw result.error;
    if(tool === "get_products") {
      const stock=await admin.rpc("read_business_stock",{p_salon:salon.id,p_user:context.user.id});
      if(stock.error)throw stock.error;
      if(!Array.isArray(stock.data?.products)||!Array.isArray(stock.data?.supplies))throw new AssistantError("ASSISTANT_SERVICE_UNAVAILABLE",503);
      const inventory=[...stock.data.products.map((row:Row)=>({...row,kind:"retail"})),...stock.data.supplies.map((row:Row)=>({...row,kind:"supply"}))] as Row[];
      const search=String(args.query||"").toLocaleLowerCase();
      const supplies=(stock.data.supplies as Row[]).filter(row=>String(row.name).toLocaleLowerCase().includes(search));
      return {products:result.data,total:result.count,capped_at:100,supplies:supplies.slice(0,100),supplies_total:supplies.length,
        stock_alerts:inventory.filter(row=>["low","out"].includes(productStock(row).state)).slice(0,100).map(row=>({name:row.name,kind:row.kind,unit:row.unit,quantity:row.inventory_quantity,threshold:row.low_stock_threshold})),
        stock_alerts_total:inventory.filter(row=>["low","out"].includes(productStock(row).state)).length,
        stock_definition:"Available stock excludes existing order reservations. Only this authenticated business is included. Untracked stock is not zero. Supplies are private, not customer products. Restocks and corrections require the Stock and supplies workflow. Financial product totals use get_earnings_summary; never infer profit from retail prices."};
    }
    if (canReadAssignments) {
      // Resolve names from the same authenticated business before model input.
      // Publish one bounded dictionary, not a repeated catalog per professional.
      const services = await admin.from("styles").select("id,name,is_draft", { count: "exact" }).eq("salon_id", salon.id).is("archived_at", null).order("name").limit(1000);
      if (services.error) throw services.error;
      const allowed = new Set((services.data || []).map(row => row.id));
      const professionals = (result.data || []) as unknown as Row[];
      return { professionals: professionals.map(row => ({ ...row, assigned_service_ids: row.assigned_service_ids == null ? null : (Array.isArray(row.assigned_service_ids) ? row.assigned_service_ids.filter((id: unknown) => typeof id === "string" && allowed.has(id)) : []) })), total: result.count, capped_at: 100,
        service_dictionary: services.data, services_total: services.count, services_capped_at: 1000,
        assignment_definition: "Null assignments offer all current and future services; an empty array offers none. IDs are filtered to this business's visible service dictionary. If the dictionary is capped, absence is not evidence that a service is unassigned. Draft services are not bookable." };
    }
    return { [list.key]: result.data, total: result.count, capped_at: 100 };
  }
  if (["get_business_summary", "get_customers", "get_upcoming_appointments"].includes(tool)) {
    // Paginate authoritative bookings, as the existing finance ledger does.
    // Aggregate numeric facts stay server-side; private bodies are never sent to
    // the planner. A bounded range prevents unbounded historical requests.
    async function readPeriod(start: unknown, end: unknown, summaryOnly = false) {
      const records: Row[] = [];
      for (let offset = 0; ; offset += 1000) {
        let query = summaryOnly
          ? admin.from("bookings").select("status,estimated_total,booking_origin")
          : tool === "get_earnings_summary"
            ? admin.from("bookings").select("id,appointment_datetime,status,estimated_total,booking_origin,payment_mode,payment_verified_at,stripe_charge_id,deposit_status,deposit_amount,stripe_processing_fee,platform_fee,net_amount_owed_salon,refund_status,refund_amount,refund_completed_at,stripe_refund_id,transfer_status,stripe_transfer_id")
            : admin.from("bookings").select("id,public_reference,appointment_datetime,status,guest_name,guest_email,customer_id,estimated_total,cancelled_by,cancellation_initiated_by,booking_origin,source,style_id,stylist_id");
        if (assigned) query = query.eq("stylist_id", assigned);
        const result = await query.eq("salon_id", salon.id).gte("appointment_datetime", start).lt("appointment_datetime", end).order("id").range(offset, offset + 999);
        if (result.error) throw result.error;
        records.push(...result.data || []);
        if ((result.data || []).length < 1000) break;
        if (offset >= 99000) throw new AssistantError("ASSISTANT_RANGE_TOO_LARGE", 409);
      }
      return records;
    }
    const bookings = await readPeriod(args.start, args.end);
    const metrics = ownerBusinessMetrics(bookings);
    if (tool === "get_customers") return { customers: bookings.map(row => ({ name: row.guest_name, booking_id: row.id, customer_id: row.customer_id, booking_origin: row.booking_origin })), scope: "customers_of_these_bookings" };
    if (tool === "get_upcoming_appointments") return { bookings: metrics.upcoming.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "guest_email"))), time_zone: salon.time_zone };
    const currentPeriod = assistantPeriodMetrics(bookings);
    const start = Date.parse(String(args.start)), end = Date.parse(String(args.end));
    const comparisonStart = new Date(start - (end - start)).toISOString();
    const previousPeriod = assistantPeriodMetrics(await readPeriod(comparisonStart, args.start, true));
    const comparison = { method: "preceding_equal_elapsed_duration", current: { start: args.start, end: args.end, ...currentPeriod }, previous: { start: comparisonStart, end: args.start, ...previousPeriod }, changes: compareAssistantPeriods(currentPeriod, previousPeriod) };
    async function performance(permission: "styles" | "stylists", field: "style_id" | "stylist_id") {
      const access = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: context.user.id, p_permission: permission });
      if (access.error) throw access.error;
      if (access.data !== true) return null;
      const groups = assistantPerformanceGroups(bookings, field), top = groups.slice(0, 10);
      const ids = top.map(group => group.record_id).filter((id): id is string => id !== null);
      const records = ids.length ? await admin.from(permission).select("id,name").eq("salon_id", salon.id).in("id", ids) : { data: [], error: null };
      if (records.error) throw records.error;
      const names = new Map((records.data || []).map(record => [String(record.id), record.name]));
      return { total_groups: groups.length, is_excerpt: groups.length > top.length, ordered_by: "appointment_count", name_source: "current_business_catalog", rows: top.map(({ record_id, ...metrics }) => ({ name: record_id ? names.get(record_id) || null : null, ...metrics })) };
    }
    const [services, professionals] = await Promise.all([performance("styles", "style_id"), performance("stylists", "stylist_id")]);
    const byStatus: Record<string, number> = {};
    for (const row of bookings) byStatus[String(row.status)] = (byStatus[String(row.status)] || 0) + 1;
    // Overview permission allows aggregates, not customer identities or contacts.
    const calendarDate = new Intl.DateTimeFormat("en-CA", { timeZone: String(salon.time_zone), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const calendarAccess = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: context.user.id, p_permission: "availability" });
    if (calendarAccess.error) throw calendarAccess.error;
    const calendar = calendarAccess.data === true ? await calendarAvailability({ salonId: salon.id, date: calendarDate, stylistId: assigned }) : null;
    return { calendar_gaps: calendar, ...metrics, ...currentPeriod, comparison, service_performance: services, professional_performance: professionals, no_show_definition: "Recorded booking status only; a past uncompleted appointment is not evidence of a no-show.", upcoming: metrics.upcoming.length, bookings: bookings.length, by_status: byStatus, profile_views: Number(salon.profile_views || 0), profile_views_period: "all_time", start: args.start, end: args.end, time_zone: salon.time_zone, customer_metric_definition: "Distinct customer identities or guest email addresses in this range", currency: "USD" };
  }
  throw new AssistantError("ASSISTANT_UNKNOWN_TOOL");
}
