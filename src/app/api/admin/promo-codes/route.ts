import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { stripeRequest } from "@/lib/stripeServer";

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    const { data, error } = await admin.from("promo_codes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ codes: data || [] });
  } catch (error) { return errorResponse(error, "Unable to load promo codes."); }
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "marketing");
    const body = await request.json() as Record<string, unknown>;
    const code = cleanText(body.code, 32).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const discountType = body.discount_type === "fixed" ? "fixed" : "percent";
    const discountValue = Number(body.discount_value);
    const appliesTo = ["booking", "subscription", "both"].includes(String(body.applies_to)) ? String(body.applies_to) : "both";
    const startsAt = new Date(String(body.starts_at || ""));
    const endsAt = new Date(String(body.ends_at || ""));
    const usageLimit = body.usage_limit ? Math.round(Number(body.usage_limit)) : null;
    if (code.length < 3) throw new Error("Promo codes need at least three letters or numbers.");
    if (!(discountValue > 0) || (discountType === "percent" && discountValue > 100)) throw new Error("Enter a valid discount value.");
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error("Choose a real start and end date.");
    if (usageLimit !== null && usageLimit < 1) throw new Error("Usage limit must be at least 1.");
    const coupon = await stripeRequest<{ id: string }>("/coupons", {
      duration: "once",
      name: `Girlz Culture ${code}`,
      ...(discountType === "percent" ? { percent_off: discountValue } : { amount_off: Math.round(discountValue * 100), currency: "usd" }),
      "metadata[girlz_culture_code]": code,
      "metadata[applies_to]": appliesTo,
    });
    const promotion = await stripeRequest<{ id: string }>("/promotion_codes", {
      coupon: coupon.id,
      code,
      active: true,
      expires_at: Math.floor(endsAt.getTime() / 1000),
      ...(usageLimit ? { max_redemptions: usageLimit } : {}),
      "metadata[girlz_culture_managed]": "true",
    });
    const { data, error } = await admin.from("promo_codes").insert({ code, discount_type: discountType, discount_value: discountValue, applies_to: appliesTo, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), usage_limit: usageLimit, stripe_coupon_id: coupon.id, stripe_promotion_code_id: promotion.id, created_by: user.id }).select().single();
    if (error) throw error;
    return Response.json({ code: data });
  } catch (error) {
    console.error("Promo code creation failed", error);
    return errorResponse(error, "Unable to create promo code.");
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 60);
    const { data: existing } = await admin.from("promo_codes").select("stripe_promotion_code_id").eq("id", id).single();
    if (!existing) throw new Error("Promo code not found.");
    const active = body.is_active === true;
    if (existing.stripe_promotion_code_id) await stripeRequest(`/promotion_codes/${existing.stripe_promotion_code_id}`, { active });
    const { data, error } = await admin.from("promo_codes").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return Response.json({ code: data });
  } catch (error) { return errorResponse(error, "Unable to update promo code."); }
}
