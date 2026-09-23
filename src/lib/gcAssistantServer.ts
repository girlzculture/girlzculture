import {readAssistantStock,prepareAssistantOperation} from "@/lib/assistantOperationsServer";
import {readAssistantFinanceRecords,prepareAssistantFinanceRecord} from "@/lib/assistantFinanceRecordsServer";
import { searchPublishedKnowledge } from "@/lib/publishedKnowledgeServer";
export { searchPublishedKnowledge } from "@/lib/publishedKnowledgeServer";
import { prepareProfessionalArchive } from "@/lib/assistantProfessionalArchive";
import { readAssistantServiceCalculation } from "@/lib/assistantServiceCalculation";
import { readAssistantBookingPrice } from "@/lib/assistantBookingPriceRead";
import "server-only";
import { bookingConversationWindow } from "@/lib/bookingConversation";
import { createHash } from "node:crypto";
import { AssistantError, stableJson, validateTool, serviceLengthOptions, type AssistantTool } from "@/lib/gcAssistantCore";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { readOwnerOperation } from "@/lib/ownerReadServer";
import { prepareOwnerOperation } from "@/lib/ownerOperationalServer";
import { readBusinessServiceCapacity } from "@/lib/businessServiceCapacityServer";
import { moderatePublicContent } from "@/lib/contentModerationServer";
import { isSubscriptionActive } from "@/lib/plans";
import { validateBusinessPolicy } from "@/lib/businessPolicyCore";
import { presentAssistantResult, presentPreparedAssistantAction } from "@/lib/gcAssistantPresentation";
import { readAssistantServices } from "@/lib/assistantServiceRead";
import { readAssistantBusinessProfile, readAssistantBusinessSettings } from "@/lib/assistantBusinessProfileRead";
import { businessMediaInventory } from "@/lib/businessMediaInventory";
import { isRegisteredTestBusiness } from "@/lib/marketplaceEligibilityServer";
import { readBusinessDepositRule } from "@/lib/businessDepositServer";
import { bookingDepositTerms } from "@/lib/businessDepositRules";
import { readBusinessClientCard } from "@/lib/businessClientServer";
import { readManualSaleOptions, prepareManualSale } from "@/lib/assistantManualSaleServer";
import { readAssistantOutstandingBalances } from "@/lib/assistantOutstandingBalances";
import { prepareAssistantBookingReschedule, assertAssistantRescheduleScope } from "@/lib/assistantBookingReschedule";
import { assistantAssignedProfessional, assertAssistantProposalScope } from "@/lib/assistantProfessionalScope";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;
const digest = (input: unknown) => createHash("sha256").update(stableJson(input)).digest("hex");
const selected = (row: Row, keys: string[]) => Object.fromEntries(keys.map(key => [key, row[key] ?? null]));

export async function assertAssistantAccess(context: Context, permission: string) {
  const { admin, salon, user } = context;
  const access = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: user.id, p_permission: permission });
  if (access.error) throw access.error;
  let effectivePermission = permission;
  if (permission === "finance_log" && access.data !== true) {
    const manage = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: user.id, p_permission: "finance_manage" });
    if (manage.error) throw manage.error;
    if (manage.data !== true) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
    effectivePermission = "finance_manage";
  } else if (access.data !== true) {
    const ownFinance = permission === "earnings" ? await admin.rpc("business_finance_scope", { p_salon: salon.id, p_user: user.id }) : null;
    if (!ownFinance || ownFinance.error || ownFinance.data?.kind !== "own") throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  }
  const subscription = await admin.from("subscriptions").select("status,current_period_end").eq("salon_id", salon.id).maybeSingle();
  if (subscription.error) throw subscription.error;
  if (!isSubscriptionActive(subscription.data?.status || salon.subscription_status, subscription.data?.current_period_end)) throw new AssistantError("ASSISTANT_PLAN_REQUIRED", 403);
  return effectivePermission;
}

export async function readAssistantData(context: Context, tool: AssistantTool, args: Row): Promise<unknown> {
  const { admin, salon } = context;
  if (tool === "calculate_service_selection") return readAssistantServiceCalculation(context, args);
  if (tool === "get_booking_price_details") return readAssistantBookingPrice(context, args);
  if (tool === "get_outstanding_balances") return readAssistantOutstandingBalances(context, args);
  if (tool === "get_business_stock") return readAssistantStock(context,args);
  if (tool === "get_finance_records") return readAssistantFinanceRecords(context,args);
  if (tool === "get_manual_sale_options") return readManualSaleOptions(context);
  if (tool === "search_platform_knowledge") return searchPublishedKnowledge(context, args.query);
  if (tool === "get_client_record") return readBusinessClientCard(context, String(args.booking_id));
  if (tool === "get_business_profile") return readAssistantBusinessProfile(context);
  if (tool === "get_business_settings") return readAssistantBusinessSettings(context);
  if (tool === "get_business_media") {
    const media = await admin.from("salons").select("gallery_photos,cover_photo_url,logo_url,photo_metadata").eq("id", salon.id).maybeSingle();
    if (media.error) throw media.error;
    if (!media.data) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
    // Pausing bookings/discovery does not unpublish the readable profile.
    // Match the public page's profile and registered-test checks instead.
    const [visible, registeredTest] = await Promise.all([
      admin.rpc("is_salon_profile_public", { target_salon_id: salon.id }),
      isRegisteredTestBusiness(admin, salon.id).catch(() => null),
    ]);
    // A visibility check failure must not erase verified saved counts or claim
    // that the business is unpublished. Unknown is represented explicitly.
    return businessMediaInventory(media.data, !visible.error && typeof visible.data === "boolean" && registeredTest !== null ? visible.data && !registeredTest : null);
  }
  if (tool === "get_business_policies") {
    const result = await admin.from("business_policy_revisions").select("id,policy,version,source_locale,published_at").eq("salon_id", salon.id).eq("id", salon.business_policy_revision_id || "00000000-0000-0000-0000-000000000000").maybeSingle();
    if (result.error) throw result.error;
    const rule = await readBusinessDepositRule(admin, salon.id);
    return { policy: result.data, platform_rules_apply: true, deposit_rules: {
      ...rule, basis: "eligible_service_subtotal_before_discounts", incident_scope: "this_business_only",
      combination: "highest_applicable_rate_once", promotion_preserves_deposit: true,
      existing_bookings: "original_snapshot_unchanged", currency: "USD",
    } };
  }
  if (tool === "get_services_and_prices") return readAssistantServices(context, args);
  if (tool === "get_availability" && args.style_id) return readBusinessServiceCapacity(context, args);
  if (tool === "get_bookings") {
    const fields = "id,public_reference,appointment_datetime,status,guest_name,booking_origin,source,style:styles(name),stylist:stylists(name)";
    let query = admin.from("bookings").select(fields, { count: "exact" }).eq("salon_id", salon.id);
    const assigned = assistantAssignedProfessional(context);
    if (assigned) query = query.eq("stylist_id", assigned);
    const result = await query.gte("appointment_datetime", args.start).lt("appointment_datetime", args.end).order("appointment_datetime").limit(300);
    if (result.error) throw result.error;
    return { bookings: result.data, total: result.count, time_zone: salon.time_zone, capped_at: 300 };
  }
  return readOwnerOperation(context, tool, args);
}

async function prepare(context: Context, tool: AssistantTool, args: Row) {
  if(["prepare_stock_change","prepare_photo_change","prepare_client_card_change","prepare_review_reply"].includes(tool)) return prepareAssistantOperation(context,args);
  if (tool === "prepare_finance_record") return prepareAssistantFinanceRecord(context,args);
  if (tool === "prepare_professional_archive") return prepareProfessionalArchive(context, args);
  if (tool === "prepare_booking_reschedule_proposal") return prepareAssistantBookingReschedule(context, args);
  if (tool === "prepare_manual_service_sale") return prepareManualSale(context, args);
  const { admin, salon } = context;
  const operation = await prepareOwnerOperation(context, tool, args);
  let before: Row = operation.before; let payload: Row = operation.payload; const notices: string[] = operation.notices;
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
    if (args.requested_deposit !== null) {
      const rule = await readBusinessDepositRule(admin, salon.id);
      if (Math.abs(Number(args.requested_deposit) - bookingDepositTerms(Number(args.price), rule).deposit) > 0.001) throw new AssistantError("ASSISTANT_DEPOSIT_PLATFORM_RULE", 409);
    }
    // Managed master styles enforce their canonical name. The established
    // service-group path preserves an owner's custom name instead of silently
    // replacing it at the database trigger after confirmation.
    payload = { master_style_id: args.name === catalog.data.name ? catalog.data.id : null, category: catalog.data.category, category_id: catalog.data.category_id, service_group_id: catalog.data.service_group_id, name: args.name, duration_min_hours: args.duration_hours, duration_max_hours: args.duration_hours, buffer_minutes: 0, base_price: args.price, price_display_min: args.price, price_display_max: args.price, length_options: serviceLengthOptions(args.length_addons as { name: string; price: number }[]), is_draft: true };
    notices.push("SERVICE_SAVED_AS_DRAFT");
  }
  if (tool === "prepare_customer_message") {
    let query = admin.from("bookings").select("id,status,appointment_datetime,duration_hours,public_reference,guest_name,booking_origin,customer_id,customer:customers(name)").eq("id", args.booking_id).eq("salon_id", salon.id);
    const assigned = assistantAssignedProfessional(context);
    if (assigned) query = query.eq("stylist_id", assigned);
    const booking = await query.maybeSingle();
    if (booking.error) throw booking.error;
    if (!booking.data) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
    before = selected(booking.data, ["id", "status", "appointment_datetime"]);
    if (booking.data.booking_origin === "business_added" && !booking.data.customer_id) throw new AssistantError("ASSISTANT_CUSTOMER_PARTICIPANT_REQUIRED", 409);
    if (!bookingConversationWindow(booking.data).open) throw new AssistantError("ASSISTANT_CONVERSATION_CLOSED", 409);
    const customer = booking.data.customer as unknown as { name?: string } | null;
    payload = { customer_name: booking.data.guest_name || customer?.name || null, public_reference: booking.data.public_reference, time_zone: salon.time_zone };
  }
  if (tool === "prepare_business_policy_update") { validateBusinessPolicy(args.policy); before = { revision_id: salon.business_policy_revision_id || null }; notices.push("POLICY_REVIEW_REQUIRED"); }
  const prose = tool === "prepare_customer_message" ? String(args.body) : tool === "prepare_business_profile_update" ? String(args.text || "") : tool === "prepare_business_policy_update" ? `${(args.policy as Row).business_policy_text || ""}\n${(args.policy as Row).preparation}\n${(args.policy as Row).notes}\n${(args.policy as Row).refund_terms || ""}` : String(args.name || args.title || "") + "\n" + String(args.description || args.bio || "");
  const moderation = await moderatePublicContent(admin, { body: prose });
  if (!moderation.allowed) throw new AssistantError("ASSISTANT_CONTENT_REVIEW_REQUIRED");
  return { before, payload, notices };
}

export async function executeAssistantTool(context: Context, input: { requestId: string; locale: string; tool: unknown; args: unknown }) {
  const checked = validateTool(input.tool, input.args);
  const effectivePermission = await assertAssistantAccess(context, checked.permission);
  if (checked.risk >= 3) await assertAssistantProposalScope(context, checked.tool, checked.args);
  if (checked.tool === "prepare_booking_reschedule_proposal") await assertAssistantRescheduleScope(context, checked.args.booking_id);
  const { admin, salon, user } = context;
  const existing = await admin.from("gc_assistant_requests").select("*").eq("id", input.requestId).eq("salon_id", salon.id).eq("requested_by", user.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.tool !== checked.tool || stableJson(existing.data.arguments) !== stableJson(checked.args) || existing.data.locale !== input.locale) throw new AssistantError("ASSISTANT_IDEMPOTENCY_CONFLICT", 409);
    // Read permissions may narrow without changing the tool-level permission
    // (for example business finance -> own earnings). Refresh through the
    // authorized query instead of replaying a previously broader payload.
    const request = checked.risk === 1 ? { ...existing.data, result: await readAssistantData(context, checked.tool, checked.args) } : existing.data;
    const presentation = checked.risk === 1
      ? presentAssistantResult(checked.tool, request.result, input.locale)
      : { message: presentPreparedAssistantAction(checked.tool, input.locale) };
    return { request, preview_required: checked.risk >= 3, replayed: true, assistant_message: presentation.message, suggestions: presentation.suggestions };
  }
  const prepared = checked.risk >= 3 ? await prepare(context, checked.tool, checked.args) : { before: {}, payload: {}, notices: [] };
  const result = checked.risk === 1 ? await readAssistantData(context, checked.tool, checked.args) : null;
  const row = { id: input.requestId, salon_id: salon.id, requested_by: user.id, locale: input.locale, tool: checked.tool, arguments: checked.args, execution_payload: prepared.payload, risk_class: checked.risk, permission: effectivePermission, before_summary: prepared.before, result,
    digest: digest({ id: input.requestId, salon: salon.id, user: user.id, locale: input.locale, tool: checked.tool, args: checked.args, before: prepared.before, payload: prepared.payload }) };
  const saved = await admin.rpc("save_gc_assistant_request", { p_request: row, p_notices: prepared.notices });
  if (saved.error) {
    if (saved.error.message.includes("ASSISTANT_IDEMPOTENCY_CONFLICT")) throw new AssistantError("ASSISTANT_IDEMPOTENCY_CONFLICT", 409);
    throw saved.error;
  }
  const presentation = checked.risk === 1
    ? presentAssistantResult(checked.tool, result, input.locale)
    : { message: presentPreparedAssistantAction(checked.tool, input.locale) };
  return { request: checked.risk === 1 ? { ...saved.data, result } : saved.data, preview_required: checked.risk >= 3, notices: prepared.notices, assistant_message: presentation.message, suggestions: presentation.suggestions };
}

export async function confirmAssistantTool(context: Context, requestId: string, previewDigest: string, policyReviewed: boolean) {
  const row = await context.admin.from("gc_assistant_requests").select("tool,arguments,execution_payload,permission,confirmed_at").eq("id", requestId).eq("salon_id", context.salon.id).eq("requested_by", context.user.id).maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) throw new AssistantError("ASSISTANT_REQUEST_NOT_FOUND", 404);
  const checked = validateTool(row.data.tool, row.data.arguments);
  await assertAssistantAccess(context, checked.permission);
  await assertAssistantProposalScope(context, checked.tool, checked.args);
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
  return { ...result.data, tool: checked.tool };
}
