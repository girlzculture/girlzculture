import "server-only";
import { createHash } from "node:crypto";
import { AssistantError, stableJson, validateTool, serviceLengthOptions, type AssistantTool } from "@/lib/gcAssistantCore";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { bookingAvailability } from "@/lib/bookingAvailabilityServer";
import { moderatePublicContent } from "@/lib/contentModerationServer";
import { isSubscriptionActive } from "@/lib/plans";
import { validateBusinessPolicy } from "@/lib/businessPolicyCore";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;
const profileFields = ["name", "description", "address_street", "address_city", "address_state", "address_zip", "hours", "instagram_url", "tiktok_url", "google_business_url", "slug", "vanity_slug", "time_zone"];
const digest = (input: unknown) => createHash("sha256").update(stableJson(input)).digest("hex");
const selected = (row: Row, keys: string[]) => Object.fromEntries(keys.map(key => [key, row[key] ?? null]));
export async function assertAssistantAccess(context: Context, permission: string) {
  const { admin, salon, user } = context;
  const access = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: user.id, p_permission: permission });
  if (access.error) throw access.error;
  if (access.data !== true) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  const subscription = await admin.from("subscriptions").select("status,current_period_end").eq("salon_id", salon.id).maybeSingle();
  if (subscription.error) throw subscription.error;
  if (!isSubscriptionActive(subscription.data?.status || salon.subscription_status, subscription.data?.current_period_end)) throw new AssistantError("ASSISTANT_PLAN_REQUIRED", 403);
}

async function readTool(context: Context, tool: AssistantTool, args: Row): Promise<unknown> {
  const { admin, salon } = context;
  if (tool === "get_business_profile") return selected(salon, profileFields);
  if (tool === "get_business_policies") {
    const result = await admin.from("business_policy_revisions").select("id,policy,version,source_locale,published_at").eq("salon_id", salon.id).eq("id", salon.business_policy_revision_id || "00000000-0000-0000-0000-000000000000").maybeSingle();
    if (result.error) throw result.error; return { policy: result.data, platform_rules_apply: true };
  }
  if (tool === "get_services_and_prices") {
    const query = String(args.query).replace(/[\\%_]/g, character => `\\${character}`);
    const result = await admin.from("styles").select("id,name,base_price,duration_min_hours,duration_max_hours,size_options,length_options,addons,is_draft", { count: "exact" }).eq("salon_id", salon.id).is("archived_at", null).ilike("name", `%${query}%`).order("name").limit(100);
    if (result.error) throw result.error;
    return { services: result.data || [], total: result.count, capped_at: 100, currency: "USD" };
  }
  if (tool === "get_availability") {
    if (args.stylist_id) { const stylist = await admin.from("stylists").select("id").eq("id", args.stylist_id).eq("salon_id", salon.id).maybeSingle(); if (stylist.error || !stylist.data) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404); }
    const available = await bookingAvailability({ salonId: salon.id, styleId: String(args.style_id), stylistId: args.stylist_id ? String(args.stylist_id) : null, date: String(args.date) });
    return { date: args.date, time_zone: available.timeZone, duration_minutes: available.durationMinutes, buffer_minutes: available.bufferMinutes, slots: available.slots.map(slot => ({ time: slot.value, stylist_id: slot.stylistId || null, professional_name: slot.stylistId ? slot.stylistName : null })) };
  }
  if (tool === "get_bookings" || tool === "get_business_summary") {
    // Summary exposes counts, not a new invented revenue definition. Detailed
    // customer fields are returned only by the bookings-permission tool.
    const fields = tool === "get_bookings" ? "id,public_reference,appointment_datetime,status,guest_name,style:styles(name),stylist:stylists(name)" : "status";
    const result = await admin.from("bookings").select(fields, { count: "exact" }).eq("salon_id", salon.id).gte("appointment_datetime", args.start).lt("appointment_datetime", args.end).order("appointment_datetime").limit(300);
    if (result.error) throw result.error;
    if (tool === "get_bookings") return { bookings: result.data, total: result.count, time_zone: salon.time_zone, capped_at: 300 };
    if ((result.count || 0) > 300) return { bookings: result.count, start: args.start, end: args.end, time_zone: salon.time_zone, breakdown_unavailable: true };
    const byStatus: Record<string, number> = {};
    for (const item of result.data || []) { const row = item as unknown as Row; const key = String(row.status); byStatus[key] = (byStatus[key] || 0) + 1; }
    return { bookings: result.count || 0, by_status: byStatus, start: args.start, end: args.end, time_zone: salon.time_zone };
  }
  throw new AssistantError("ASSISTANT_UNKNOWN_TOOL");
}

async function prepare(context: Context, tool: AssistantTool, args: Row) {
  const { admin, salon } = context;
  let before: Row = {}; let payload: Row = {}; const notices: string[] = [];
  if (tool === "prepare_business_profile_update") {
    before = selected(salon, [String(args.field)]);
    if (args.field === "hours") payload = { hours: Object.fromEntries(Object.entries(args.hours as Row).map(([day, value]) => [day.slice(0, 3), value])) };
    if (["instagram_url", "tiktok_url"].includes(String(args.field))) {
      if (!context.isOwner) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
      notices.push("SOCIAL_LINK_REQUIRES_PLATFORM_REVIEW");
    }
  }
  if (tool === "prepare_availability_block") {
    if (args.time_zone !== salon.time_zone || Date.parse(String(args.start)) <= Date.now() || Date.parse(String(args.end)) - Date.parse(String(args.start)) > 7 * 86400_000) throw new AssistantError("ASSISTANT_INVALID_DATE_RANGE");
    payload = { time_zone: salon.time_zone, all_professionals: !args.stylist_id };
    if (args.stylist_id) { const stylist = await admin.from("stylists").select("id,name").eq("id", args.stylist_id).eq("salon_id", salon.id).maybeSingle(); if (stylist.error || !stylist.data) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404); payload.stylist_name = stylist.data.name; }
  }
  if (tool === "prepare_service") {
    const catalog = await admin.from("master_styles").select("id,name,category,category_id,service_group_id").eq("id", args.master_style_id).eq("is_active", true).maybeSingle();
    if (catalog.error) throw catalog.error;
    if (!catalog.data) throw new AssistantError("ASSISTANT_CATALOG_CLARIFICATION_REQUIRED", 409);
    const deposit = await admin.from("engine_settings").select("published_value").eq("setting_key", "booking.deposit_percentage").eq("status", "Published").maybeSingle();
    if (deposit.error) throw deposit.error;
    const percentage = Number(deposit.data?.published_value ?? 10);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new AssistantError("ASSISTANT_UNAVAILABLE", 503);
    const platformDeposit = Math.round(Number(args.price) * percentage) / 100;
    if (args.requested_deposit !== null && Math.abs(Number(args.requested_deposit) - platformDeposit) > 0.001) throw new AssistantError("ASSISTANT_DEPOSIT_PLATFORM_RULE", 409);
    // Managed master styles enforce their canonical name. The established
    // service-group path preserves an owner's custom name instead of silently
    // replacing it at the database trigger after confirmation.
    payload = { master_style_id: args.name === catalog.data.name ? catalog.data.id : null, category: catalog.data.category, category_id: catalog.data.category_id, service_group_id: catalog.data.service_group_id, name: args.name, duration_min_hours: args.duration_hours, duration_max_hours: args.duration_hours, buffer_minutes: 0, base_price: args.price, price_display_min: args.price, price_display_max: args.price, length_options: serviceLengthOptions(args.length_addons as { name: string; price: number }[]), is_draft: true };
    notices.push("SERVICE_SAVED_AS_DRAFT");
  }
  if (tool === "prepare_customer_message") {
    const booking = await admin.from("bookings").select("id,status,appointment_datetime,public_reference,guest_name,customer:customers(name)").eq("id", args.booking_id).eq("salon_id", salon.id).maybeSingle();
    if (booking.error) throw booking.error;
    if (!booking.data) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
    before = selected(booking.data, ["id", "status", "appointment_datetime"]);
    const customer = booking.data.customer as unknown as { name?: string } | null;
    payload = { customer_name: booking.data.guest_name || customer?.name || null, public_reference: booking.data.public_reference, time_zone: salon.time_zone };
  }
  if (tool === "prepare_business_policy_update") { validateBusinessPolicy(args.policy); before = { revision_id: salon.business_policy_revision_id || null }; notices.push("POLICY_REVIEW_REQUIRED"); }
  const prose = tool === "prepare_customer_message" ? String(args.body) : tool === "prepare_business_profile_update" ? String(args.text || "") : tool === "prepare_business_policy_update" ? `${(args.policy as Row).preparation}\n${(args.policy as Row).notes}` : String(args.name || "");
  const moderation = await moderatePublicContent(admin, { body: prose });
  if (!moderation.allowed) throw new AssistantError("ASSISTANT_CONTENT_REVIEW_REQUIRED");
  return { before, payload, notices };
}

export async function executeAssistantTool(context: Context, input: { requestId: string; locale: string; tool: unknown; args: unknown }) {
  const checked = validateTool(input.tool, input.args);
  await assertAssistantAccess(context, checked.permission);
  const { admin, salon, user } = context;
  const existing = await admin.from("gc_assistant_requests").select("*").eq("id", input.requestId).eq("salon_id", salon.id).eq("requested_by", user.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.tool !== checked.tool || stableJson(existing.data.arguments) !== stableJson(checked.args) || existing.data.locale !== input.locale) throw new AssistantError("ASSISTANT_IDEMPOTENCY_CONFLICT", 409);
    return { request: existing.data, preview_required: checked.risk >= 3, replayed: true };
  }
  const prepared = checked.risk >= 3 ? await prepare(context, checked.tool, checked.args) : { before: {}, payload: {}, notices: [] };
  const result = checked.risk === 1 ? await readTool(context, checked.tool, checked.args) : null;
  const row = { id: input.requestId, salon_id: salon.id, requested_by: user.id, locale: input.locale, tool: checked.tool, arguments: checked.args, execution_payload: prepared.payload, risk_class: checked.risk, permission: checked.permission, before_summary: prepared.before, result,
    digest: digest({ id: input.requestId, salon: salon.id, user: user.id, locale: input.locale, tool: checked.tool, args: checked.args, before: prepared.before, payload: prepared.payload }) };
  const saved = await admin.rpc("save_gc_assistant_request", { p_request: row, p_notices: prepared.notices });
  if (saved.error) {
    if (saved.error.message.includes("ASSISTANT_IDEMPOTENCY_CONFLICT")) throw new AssistantError("ASSISTANT_IDEMPOTENCY_CONFLICT", 409);
    throw saved.error;
  }
  return { request: saved.data, preview_required: checked.risk >= 3, notices: prepared.notices };
}

export async function confirmAssistantTool(context: Context, requestId: string, previewDigest: string, policyReviewed: boolean) {
  const row = await context.admin.from("gc_assistant_requests").select("tool,arguments,execution_payload,permission,confirmed_at").eq("id", requestId).eq("salon_id", context.salon.id).eq("requested_by", context.user.id).maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) throw new AssistantError("ASSISTANT_REQUEST_NOT_FOUND", 404);
  const checked = validateTool(row.data.tool, row.data.arguments);
  await assertAssistantAccess(context, checked.permission);
  if (checked.tool === "prepare_business_policy_update" && !policyReviewed) throw new AssistantError("ASSISTANT_POLICY_REVIEW_REQUIRED", 409);
  // Re-run deterministic catalog/moderation checks at execution time as well.
  if (!row.data.confirmed_at) {
    const fresh = await prepare(context, checked.tool, checked.args);
    if (stableJson(fresh.payload) !== stableJson(row.data.execution_payload)) throw new AssistantError("ASSISTANT_PREVIEW_STALE", 409);
  }
  const result = await context.admin.rpc("confirm_gc_assistant_request", { p_request: requestId, p_salon: context.salon.id, p_actor: context.user.id, p_digest: previewDigest });
  if (result.error) {
    const code = result.error.message.match(/ASSISTANT_[A-Z_]+/)?.[0] || "ASSISTANT_ACTION_FAILED";
    throw new AssistantError(code, code.includes("ACCESS") ? 403 : 409);
  }
  if (result.data?.verified !== true) throw new AssistantError(result.data?.code || "ASSISTANT_ACTION_FAILED", 409);
  return result.data;
}
