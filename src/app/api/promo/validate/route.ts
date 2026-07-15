import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { previewPromoCode } from "@/lib/promoCodes";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "promo-preview", 12, 10 * 60_000);
    const body = await request.json() as Record<string, unknown>;
    const code = cleanText(body.code, 40);
    const purpose = body.purpose === "subscription" ? "subscription" : "booking";
    const amount = Math.max(0, Number(body.amount || 0));
    if (!code || !(amount > 0)) throw new Error("Enter a promo code for this checkout.");
    const preview = await previewPromoCode(code, purpose, amount);
    return Response.json({ code: preview.promo.code, discount: preview.discount, amount_after_discount: preview.amountAfterDiscount });
  } catch (error) {
    return errorResponse(error, "Unable to validate promo code.");
  }
}
