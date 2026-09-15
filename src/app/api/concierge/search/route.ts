import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { runBeautyConcierge, parseConciergeIntent } from "@/lib/beautyConciergeServer";
import { validCoordinates } from "@/lib/location";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { cleanText, enforceRateLimit, errorResponse, RateLimitError, rejectBot } from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  let admin;
  try {
    admin = getSupabaseAdmin();
    enforceRateLimit(request, "beauty-concierge", 12, 60_000);
    const raw = await request.text();
    if (raw.length > 8000) rejectRequest("Keep your search request short.", 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { rejectRequest("Send a valid search request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) rejectRequest("Send a valid search request.");
    rejectBot(body);
    const prompt = cleanText(body.prompt, 600);
    if (prompt.length < 3) rejectRequest("Describe the style, location, or appointment you want.");
    const coordinates = { lat: Number(body.latitude), lng: Number(body.longitude) };
    const origin = body.latitude != null && body.longitude != null && validCoordinates(coordinates) ? coordinates : null;
    const language = cleanText(body.language, 20) || "en";
    let previousIntent;
    try { previousIntent = body.previous_intent ? parseConciergeIntent(body.previous_intent) : undefined; } catch { rejectRequest("Start a new conversation; the previous search details are invalid."); }
    const result = await runBeautyConcierge({ prompt, language, origin, request, previousIntent });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse(error, error.message);
    return monitoredRouteFailure({ request, admin, error, feature: "ai_concierge", action: "search", actorRole: "public", safeMessage: "We couldn't complete that search." });
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/concierge/search", "POST"), POSTHandler);
