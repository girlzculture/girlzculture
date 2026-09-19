export type SalonPromotion = {
  id?: string | null;
  salon_id?: string | null;
  title?: string | null;
  description?: string | null;
  public_headline?: string | null;
  promotion_type?: string | null;
  discount_value?: number | string | null;
  discount_label?: string | null;
  status?: string | null;
  target_scope?: string | null;
  target_ids?: string[] | null;
  restrictions?: Record<string, unknown> | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean | null;
  archived_at?: string | null;
};

export type PromotionPriceContext = {
  salonId: string;
  styleId?: string | null;
  productId?: string | null;
  serviceGroupId?: string | null;
  masterStyleId?: string | null;
  basePrice: number;
  selectedAddons: Array<{ value: string; label?: string; price: number }>;
  subtotal: number;
  /** Applicable pre-discount booking deposit. Product-only carts pass zero. */
  protectedDeposit?: number;
  now?: Date;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const normalized = (value: unknown) => String(value || "").trim().toLowerCase();

export function isPromotionActive(promotion: SalonPromotion, at = new Date()) {
  const starts = promotion.starts_at ? new Date(promotion.starts_at).getTime() : Number.NEGATIVE_INFINITY;
  const ends = promotion.ends_at ? new Date(promotion.ends_at).getTime() : Number.POSITIVE_INFINITY;
  return promotion.status === "Active"
    && promotion.is_active === true
    && !promotion.archived_at
    && Number.isFinite(at.getTime())
    && at.getTime() >= starts
    && at.getTime() <= ends;
}

function targetMatches(promotion: SalonPromotion, context: PromotionPriceContext) {
  if (promotion.salon_id !== context.salonId) return false;
  const targets = new Set((promotion.target_ids || []).map(normalized).filter(Boolean));
  switch (promotion.target_scope || "salon") {
    // Business-wide means its eligible services. Product offers require explicit targets.
    case "salon": return Boolean(context.styleId && !context.productId);
    case "services": return Boolean(context.styleId && targets.has(normalized(context.styleId)));
    case "service_groups": return Boolean(context.serviceGroupId && targets.has(normalized(context.serviceGroupId)));
    case "master_styles": return Boolean(context.masterStyleId && targets.has(normalized(context.masterStyleId)));
    case "products": return Boolean(context.productId && targets.has(normalized(context.productId)));
    case "addons": return context.selectedAddons.some((addon) => targets.has(normalized(addon.value)) || targets.has(normalized(addon.label)));
    default: return false;
  }
}

export function bestPromotionForContext(
  promotions: SalonPromotion[],
  context: PromotionPriceContext,
) {
  return promotions
    .map((promotion) => ({
      promotion,
      price: calculateSalonPromotion(promotion, context),
    }))
    .filter((entry) => entry.price.eligible)
    .sort((a, b) => b.price.discount - a.price.discount)[0] || null;
}

export function calculateSalonPromotion(promotion: SalonPromotion | null | undefined, context: PromotionPriceContext) {
  const rejected = { eligible: false, discount: 0, total: context.subtotal };
  const deposit = context.protectedDeposit ?? 0;
  if (![context.subtotal, context.basePrice, deposit, ...context.selectedAddons.map(addon => addon.price)].every(value => Number.isFinite(value) && value >= 0) || deposit > context.subtotal) return rejected;
  if (!promotion || !isPromotionActive(promotion, context.now) || !targetMatches(promotion, context)) return rejected;
  const restrictions = promotion.restrictions || {};
  const minimumSubtotal = Number(restrictions.minimum_subtotal || 0);
  if (!Number.isFinite(minimumSubtotal) || minimumSubtotal < 0 || context.subtotal < minimumSubtotal) return rejected;

  const value = Number(promotion.discount_value || 0);
  if (!Number.isFinite(value) || value < 0) return rejected;
  const targets = new Set((promotion.target_ids || []).map(normalized));
  const eligibleAddons = context.selectedAddons.filter(addon => promotion.target_scope !== "addons" || targets.has(normalized(addon.value)) || targets.has(normalized(addon.label)));
  const eligibleSubtotal = promotion.target_scope === "addons" ? eligibleAddons.reduce((sum, addon) => sum + addon.price, 0) : context.subtotal;
  let discount = 0;
  if (promotion.promotion_type === "percentage") discount = eligibleSubtotal * Math.min(100, value) / 100;
  else if (promotion.promotion_type === "fixed") discount = value;
  else if (promotion.promotion_type === "free_service") discount = context.basePrice;
  else if (promotion.promotion_type === "free_addon") {
    discount = eligibleAddons
      .reduce((highest, addon) => Math.max(highest, addon.price), 0);
  }
  else if (promotion.promotion_type !== "descriptive") return rejected;
  // Round the selected saving once, then cap in cents so the deposit never changes.
  const maximumCents = Math.min(Math.round(eligibleSubtotal * 100), Math.round(context.subtotal * 100) - Math.round(deposit * 100));
  discount = Math.min(maximumCents, Math.max(0, Math.round(discount * 100))) / 100;
  return { eligible: true, discount, total: roundMoney(context.subtotal - discount) };
}

export function promotionLabel(promotion: SalonPromotion, appliedDiscount?: number) {
  if (appliedDiscount !== undefined && Number.isFinite(appliedDiscount)) return `$${Math.max(0, appliedDiscount).toFixed(2)} saving`;
  // Before a selection is priced, never promise that a service offer waives
  // its protected deposit, including legacy "free service" offers.
  if (promotion.target_scope !== "products") {
    const value = Number(promotion.discount_value || 0);
    if (promotion.promotion_type === "percentage") return `Up to ${value}% off · deposit protected`;
    if (promotion.promotion_type === "fixed") return `Up to $${value.toFixed(2)} off · deposit protected`;
    if (promotion.promotion_type === "free_service") return "Service offer · deposit protected";
    if (promotion.promotion_type === "free_addon") return "Add-on offer · deposit protected";
  }
  if (promotion.discount_label?.trim()) return promotion.discount_label.trim();
  const value = Number(promotion.discount_value || 0);
  if (promotion.promotion_type === "percentage") return `${value}% off`;
  if (promotion.promotion_type === "fixed") return `$${value.toFixed(2)} off`;
  if (promotion.promotion_type === "free_addon") return "Free eligible add-on";
  if (promotion.promotion_type === "free_service") return "Free eligible service";
  return "Special offer";
}
