import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
export const runtime = "nodejs";
async function handle(request: Request) {
  const expected = process.env.INTERNAL_API_SECRET;
  const supplied = request.headers.get("x-internal-secret") || "";
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  try {
    const result = await admin.rpc("publish_due_business_marketing_posts");
    if (result.error) throw result.error;
    return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const reference = await capturePlatformError({ request, admin, actorRole: "system", feature: "business-marketing", action: "publish-due", error, safeMessage: "Scheduled business updates need review." });
    return safeFailure("Scheduled business updates need review.", reference, 500);
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/marketing/publish-due", "POST"), handle);
