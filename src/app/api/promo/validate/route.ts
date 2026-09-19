import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { previewPromoCode } from "@/lib/promoCodes";
import { protectedBookingDiscount } from "@/lib/businessDepositRules";

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "promo-preview", 12, 10 * 60_000);
    const body = await request.json() as Record<string, unknown>;
    const code = cleanText(body.code, 40);
    const purpose = body.purpose === "subscription" ? "subscription" : "booking";
    const amount = Math.max(0, Number(body.amount || 0));
    if (!code || !Number.isFinite(amount) || !(amount > 0) || amount > 100000) throw new Error("Enter a promo code for this checkout.");
    const preview = await previewPromoCode(code, purpose, amount);
    if (purpose === "booking") {
      const deposit=Number(body.protected_deposit);
      const price=protectedBookingDiscount(amount,deposit,preview.discount);
      return Response.json({code:preview.promo.code,discount:price.discount,amount_after_discount:price.total,protected_deposit:deposit},{headers:{"Cache-Control":"private, no-store"}});
    }
    return Response.json({ code: preview.promo.code, discount: preview.discount, amount_after_discount: preview.amountAfterDiscount });
  } catch (error) {
    return errorResponse(error, "Unable to validate promo code.");
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/promo/validate", "POST"), POSTHandler);
