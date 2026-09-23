import { requireSalonOwner, assertBusinessTeamAccess } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { readBusinessFinances } from "@/lib/businessFinanceServer";
import { validateFinancePeriod } from "@/lib/businessFinanceCore";
import { capturePlatformError } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";

const fields: Record<string, string[]> = {
  sale: ["occurred_at", "source", "kind", "name", "product_id", "stylist_id", "client_name", "list_cents", "discount_cents", "cost_cents", "quantity", "method"],
  receipt: ["occurred_at", "sale_id", "booking_id", "product_order_id", "amount_cents", "method", "note"],
  refund: ["occurred_at", "original_payment_id", "amount_cents", "note"],
  expense: ["occurred_at", "category", "amount_cents", "treatment", "note"],
  arrangement: ["stylist_id", "effective_from", "kind", "basis", "percent", "amount_cents", "period"],
  obligation: ["arrangement_version", "period_start", "due_at"],
  compensation_payment: ["occurred_at", "stylist_id", "obligation_id", "kind", "amount_cents", "method"],
};
async function handle(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonOwner>> | undefined;
  try {
    context = await requireSalonOwner(request);
    enforceRateLimit(request, `finance:${context.user.id}`, 90, 60_000);
    const headers = { "Cache-Control": "private, no-store" };
    if (request.method === "GET") {
      const url = new URL(request.url);
      if (url.searchParams.size === 1 && url.searchParams.get("options") === "entry") {
        const result = await context.admin.rpc("business_finance_entry_options", { p_salon: context.salon.id, p_user: context.user.id });
        if (result.error) throw result.error;
        return Response.json(result.data, { headers });
      }
      if ([...url.searchParams.keys()].some(key => !["from", "to"].includes(key))) throw Error("FINANCE_INVALID_RECORD");
      const period = { from: url.searchParams.get("from") || "", to: url.searchParams.get("to") || "", timeZone: String(context.salon.time_zone || "America/New_York") };
      validateFinancePeriod(period);
      return Response.json(await readBusinessFinances(context, period), { headers });
    }
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["action", "request_id", "payload"].includes(key)) || typeof body.action !== "string" || !fields[body.action] || typeof body.request_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.request_id) || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) throw Error("FINANCE_INVALID_RECORD");
    if (Object.keys(body.payload).some(key => !fields[body.action].includes(key)) || JSON.stringify(body.payload).length > 12000) throw Error("FINANCE_INVALID_RECORD");
    for (const [key, value] of Object.entries(body.payload)) {
      if ((key.endsWith("_cents") || key === "quantity") && value !== null && (!Number.isSafeInteger(value) || Number(value) < 0)) throw Error("FINANCE_INVALID_AMOUNT");
    }
    if (["arrangement", "obligation", "compensation_payment"].includes(body.action)) await assertBusinessTeamAccess(context);
    const result = await context.admin.rpc("record_business_finance", { p_salon: context.salon.id, p_user: context.user.id, p_request: body.request_id, p_action: body.action, p_payload: body.payload });
    if (result.error) throw result.error;
    return Response.json(result.data, { headers });
  } catch (error) {
    const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
    const known = /^FINANCE_[A-Z_]+$/.test(message);
    const status = /Unauthorized/.test(message) ? 401 : /ACCESS_DENIED|OWNER_REQUIRED|PLAN_REQUIRED|Forbidden/.test(message) ? 403 : /RECORD_NOT_FOUND/.test(message) ? 404 : /CONFLICT|EXCEEDS|UNVERIFIED|RANGE_TOO_LARGE|STOCK_INSUFFICIENT/.test(message) ? 409 : known || error instanceof SyntaxError ? 400 : 500;
    const reference = await capturePlatformError({ request, admin: context?.admin, error, feature: "business-finances", action: request.method === "GET" ? "read" : "record", actorRole: "salon", actorId: context?.user.id, salonId: context?.salon.id, safeMessage: "Business finance records could not be accessed.", severity: status >= 500 ? "high" : "low" });
    return Response.json({ code: known ? message : "FINANCE_UNAVAILABLE", request_id: reference }, { status, headers: { "Cache-Control": "private, no-store", "X-Request-ID": reference } });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/finances", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/finances", "POST"), handle);
