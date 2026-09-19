import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { readContributionServiceCapacity } from "@/lib/businessServiceCapacityServer";
import { AssistantError } from "@/lib/gcAssistantCore";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonOwner>> | undefined;
  try {
    context = await requireSalonOwner(request);
    enforceRateLimit(request, `service-capacity:${context.user.id}`, 20, 60_000);
    const params = new URL(request.url).searchParams;
    const allowed = ["from", "to", "style_id", "stylist_id", "date", "days", "selected_options"];
    if (params.size !== allowed.length || allowed.some(key => params.getAll(key).length !== 1) || params.toString().length > 4000) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    const input = { style_id: params.get("style_id"), stylist_id: params.get("stylist_id") || null, date: params.get("date"), days: Number(params.get("days")), selected_options: JSON.parse(params.get("selected_options") || "[]") };
    return Response.json(await readContributionServiceCapacity(context, input, params.get("from")!, params.get("to")!), { headers });
  } catch (error) {
    const message = String((error as { message?: unknown })?.message || "");
    const status = /Unauthorized/.test(message) ? 401 : /ACCESS_DENIED|Forbidden/.test(message) ? 403 : error instanceof RateLimitError ? 429 : error instanceof SyntaxError || /INVALID/.test(message) ? 400 : error instanceof AssistantError ? error.status : 503;
    const safeMessage = "Service openings could not be verified. Refresh the current records and try again.";
    const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, actorRole: "salon", feature: "service-capacity", action: "read", error, safeMessage });
    return safeFailure(safeMessage, reference, status, { code: message === "SERVICE_CAPACITY_REVIEW_CHANGED" ? message : "SERVICE_CAPACITY_UNAVAILABLE" });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/service-capacity", "GET"), handle);
