import { searchPublishedKnowledge } from "@/lib/gcAssistantServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { enforceRateLimit, RateLimitError, errorResponse } from "@/lib/requestSecurity";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";

async function POSTHandler(request: Request) {
  let admin;
  try {
    enforceRateLimit(request, "public-knowledge", 20, 60_000);
    const raw = await request.text();
    if (raw.length > 1200) rejectRequest("Keep your question under 240 characters.", 413);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) rejectRequest("Enter a short question for the published Help center.");
      body = parsed as Record<string, unknown>;
    } catch {
      rejectRequest("Send a valid JSON question.");
    }
    if (typeof body.query !== "string" || body.query.trim().length < 2 || body.query.length > 240) rejectRequest("Enter a short question for the published Help center.");
    admin = getSupabaseAdmin();
    // Only the public, published CMS snapshot is searched. No account records.
    return Response.json(await searchPublishedKnowledge({ admin }, body.query), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse(error, error.message);
    return monitoredRouteFailure({ request, admin, error, feature: "ai_concierge", action: "published-knowledge", actorRole: "public", safeMessage: "Published help could not be searched." });
  }
}

export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/concierge/knowledge", "POST"), POSTHandler);
