import "server-only";
import { calculateBookingServiceSelection, ServiceSelectionError } from "@/lib/bookingServiceSelection";
import { readBusinessDepositRule } from "@/lib/businessDepositServer";
import { bookingDepositTerms, protectedBookingDiscount } from "@/lib/businessDepositRules";
import { calculateSalonPromotion, type SalonPromotion } from "@/lib/salonPromotions";
import { hasPlanFeature } from "@/lib/plans";
import { AssistantError } from "@/lib/gcAssistantCore";
import { priceReadScope, unchangedPriceScope, priceObject, priceUnavailable, type PriceReadContext } from "@/lib/assistantPriceReadScope";
const styleFields = "id,salon_id,name,base_price,price_display_min,service_group_id,master_style_id,size_options,length_options,addons,option_groups,archived_at";
const offerFields = "id,salon_id,title,public_headline,promotion_type,discount_value,status,target_scope,target_ids,restrictions,starts_at,ends_at,is_active,archived_at";
export async function readAssistantServiceCalculation(context: PriceReadContext, args: Record<string, unknown>) {
  const permissions = ["styles", "my_page", ...(args.promotion_id ? ["promotions"] : [])];
  const before = await priceReadScope(context, permissions);
  const read = await context.admin.from("styles").select(styleFields).eq("id", args.service_id).eq("salon_id", context.salon.id).is("archived_at", null).maybeSingle();
  const style = priceObject(read.data);
  if (read.error) throw priceUnavailable();
  if (!style) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
  if (style.id !== args.service_id || style.salon_id !== context.salon.id || style.archived_at != null || style.base_price == null && style.price_display_min == null) throw priceUnavailable();
  const selectedOptions: Record<string, string[]> = {};
  for (const group of args.selected_options as { group_id: string; values: string[] }[]) {
    if (Object.hasOwn(selectedOptions, group.group_id)) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    Object.defineProperty(selectedOptions, group.group_id, { value: group.values, enumerable: true });
  }
  let material = null;
  if (args.selected_material_id) {
    const read = await context.admin.from("style_materials").select("id,style_id,name,price").eq("id", args.selected_material_id).eq("style_id", style.id).maybeSingle();
    material = priceObject(read.data);
    if (read.error || !material || material.id !== args.selected_material_id || material.style_id !== style.id) throw priceUnavailable();
  }
  const asOf = new Date();
  const base = { service_id: style.id, service_name: String(style.name || "Service").slice(0, 200), currency: "USD", as_of: asOf.toISOString(), href: "/salon/dashboard/styles-pricing" };
  let calculation;
  try { calculation = calculateBookingServiceSelection(style, { selected_size: args.selected_size as string | null, selected_length: args.selected_length as string | null, selected_addons: args.selected_addons as string[], selected_options: selectedOptions, selected_material_id: args.selected_material_id as string | null }, material); }
  catch (error) {
    unchangedPriceScope(before, await priceReadScope(context, permissions));
    if (error instanceof ServiceSelectionError) return { ...base, available: false, reason: error.code, required_group_id: error.group_id, required_group_label: error.group_label, money: null, definition: "No complete amount is available. Resolve this current saved choice; do not invent a selection or a zero adjustment." };
    throw error;
  }
  const rule = await readBusinessDepositRule(context.admin, context.salon.id);
  let promotion: SalonPromotion | null = null;
  if (args.promotion_id) {
    const read = await context.admin.from("salon_promotions").select(offerFields).eq("id", args.promotion_id).eq("salon_id", context.salon.id).maybeSingle();
    const row = priceObject(read.data);
    if (read.error || !row || row.id !== args.promotion_id || row.salon_id !== context.salon.id) throw priceUnavailable();
    promotion = row as SalonPromotion;
  }
  unchangedPriceScope(before, await priceReadScope(context, permissions));
  const restrictions = promotion?.restrictions == null ? {} : priceObject(promotion.restrictions);
  if (!restrictions || Object.entries(restrictions).some(([key, value]) => !["minimum_subtotal", "new_customers_only", "usage_limit", "per_customer_limit", "terms"].includes(key) || (key === "terms" ? typeof value !== "string" : key === "new_customers_only" ? typeof value !== "boolean" : typeof value !== "number" || !Number.isFinite(value) || value < 0))) throw priceUnavailable();
  const customerDependent = rule.repeat_incident_count !== null || restrictions.new_customers_only === true || Number(restrictions.per_customer_limit || 0) > 0;
  const result = { ...base, line_count: calculation.lines.length, shown_line_count: Math.min(12, calculation.lines.length), lines_are_excerpt: calculation.lines.length > 12, lines: calculation.lines.slice(0, 12), subtotal_cents: Math.round(calculation.subtotal * 100), deposit_rule_version: rule.version,
    definition: "Read-only selected service arithmetic in USD, rounding the subtotal once. Line amounts are saved dollar adjustments before rounding. No customer identity/history, availability, product, tax, payment or reservation was read. Customer eligibility and offer usage are rechecked at checkout; no availability or final invoice is promised. Existing bookings retain their original terms." };
  if (customerDependent) return { ...result, available: false, reason: "customer_context_required", money: null, promotion_id: args.promotion_id, deposit_basis: "eligible_service_subtotal_before_discounts" };
  const terms = bookingDepositTerms(calculation.subtotal, rule);
  const price = promotion ? calculateSalonPromotion(promotion, { salonId: context.salon.id, styleId: String(style.id), serviceGroupId: style.service_group_id as string | null, masterStyleId: style.master_style_id as string | null, basePrice: Number(style.base_price ?? style.price_display_min ?? 0), selectedAddons: calculation.selected_addons, subtotal: calculation.subtotal, protectedDeposit: terms.deposit, now: asOf }) : { eligible: true, discount: 0, total: calculation.subtotal };
  if (promotion && (!hasPlanFeature(String(before.subscription_tier), "promotions") || !price.eligible)) return { ...result, available: false, reason: "promotion_not_applicable", money: null, promotion_id: args.promotion_id };
  const protectedPrice = protectedBookingDiscount(calculation.subtotal, terms.deposit, price.discount);
  return { ...result, available: true, reason: null, promotion_id: args.promotion_id, promotion_title: promotion ? String(promotion.public_headline || promotion.title || "").slice(0, 200) : null,
    promotion_eligibility: promotion ? "selection_matches_unreserved" : "not_selected", money: { subtotal_cents: Math.round(calculation.subtotal * 100), discount_cents: Math.round(protectedPrice.discount * 100), total_cents: Math.round(protectedPrice.total * 100), protected_deposit_cents: Math.round(terms.deposit * 100), remaining_balance_cents: Math.round(protectedPrice.balance * 100) },
    deposit_basis: terms.basis, deposit_rate: terms.rate, deposit_minimum_waived: terms.minimum_waived, deposit_threshold_applies: terms.threshold_applies, discount_basis: "eligible_subtotal_capped_at_unpaid_balance" };
}
