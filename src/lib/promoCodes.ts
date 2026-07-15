import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type PromoPurpose = "booking" | "subscription";
export type Promo = { id?: string; promo_code_id?: string; redemption_id?: string; code: string; discount_type: "percent" | "fixed"; discount_value: number; stripe_coupon_id: string };

function promoError(message: string) {
  if (/PROMO_NOT_STARTED/.test(message)) return "This code is not active yet.";
  if (/PROMO_EXPIRED/.test(message)) return "This code has expired.";
  if (/PROMO_LIMIT_REACHED/.test(message)) return "This code has reached its usage limit.";
  if (/PROMO_NOT_APPLICABLE/.test(message)) return "This code cannot be used for this checkout.";
  if (/PROMO_INVALID/.test(message)) return "That promo code is not valid.";
  return message;
}

export function discountAmount(promo: Pick<Promo, "discount_type" | "discount_value">, amount: number) {
  const raw = promo.discount_type === "percent" ? amount * Number(promo.discount_value) / 100 : Number(promo.discount_value);
  return Math.min(amount, Math.max(0, Math.round(raw * 100) / 100));
}

export async function previewPromoCode(code: string, purpose: PromoPurpose, amount: number) {
  const admin = getSupabaseAdmin();
  const normalized = code.trim().toLowerCase();
  const { data, error } = await admin.from("promo_codes").select("*").ilike("code", normalized).limit(1).maybeSingle();
  if (error) throw error;
  if (!data || !data.is_active) throw new Error("That promo code is not valid.");
  const now = Date.now();
  if (new Date(data.starts_at).getTime() > now) throw new Error("This code is not active yet.");
  if (new Date(data.ends_at).getTime() <= now) throw new Error("This code has expired.");
  if (![purpose, "both"].includes(data.applies_to)) throw new Error("This code cannot be used for this checkout.");
  const { count } = await admin.from("promo_code_redemptions").select("id", { count: "exact", head: true }).eq("promo_code_id", data.id).eq("status", "pending").gt("expires_at", new Date().toISOString());
  if (data.usage_limit !== null && Number(data.usage_count || 0) + Number(count || 0) >= Number(data.usage_limit)) throw new Error("This code has reached its usage limit.");
  const promo = { id: data.id, code: String(data.code).toUpperCase(), discount_type: data.discount_type, discount_value: Number(data.discount_value), stripe_coupon_id: data.stripe_coupon_id } as Promo;
  const discount = discountAmount(promo, amount);
  return { promo, discount, amountAfterDiscount: Math.max(0, Math.round((amount - discount) * 100) / 100) };
}

export async function reservePromoCode(code: string, purpose: PromoPurpose, values: { userId?: string | null; salonId?: string | null; bookingIntentId?: string | null }) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("reserve_promo_code", { p_code: code, p_purpose: purpose, p_user_id: values.userId || null, p_salon_id: values.salonId || null, p_booking_intent_id: values.bookingIntentId || null });
  if (error) throw new Error(promoError(error.message));
  return data as Promo;
}
