import { runBeautyConcierge } from "@/lib/beautyConciergeServer";
import { validCoordinates } from "@/lib/location";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { cleanText, enforceRateLimit, errorResponse, RateLimitError, rejectBot } from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let admin;
  try {
    admin = getSupabaseAdmin();
    enforceRateLimit(request, "beauty-concierge", 12, 60_000);
    const body = await request.json() as Record<string, unknown>;
    rejectBot(body);
    const prompt = cleanText(body.prompt, 600);
    if (prompt.length < 3) rejectRequest("Describe the style, location, or appointment you want.");
    const coordinates = { lat: Number(body.latitude), lng: Number(body.longitude) };
    const origin = validCoordinates(coordinates) ? coordinates : null;
    const language = cleanText(body.language, 20) || "en";
    const result = await runBeautyConcierge({ prompt, language, origin, request });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse(error, error.message);
    return monitoredRouteFailure({ request, admin, error, feature: "ai_concierge", action: "search", actorRole: "public", safeMessage: "We couldn't complete that search." });
  }
}
