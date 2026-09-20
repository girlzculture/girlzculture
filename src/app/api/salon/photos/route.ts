import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { validatePhotoDetails } from "@/lib/businessPhotoMetadata";
import { moderatePublicContent } from "@/lib/contentModerationServer";
import { capturePlatformError } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";

async function handle(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonPermission>> | undefined;
  try {
    context = await requireSalonPermission(request, "photos");
    enforceRateLimit(request, `business-photo-details:${context.user.id}`, 60, 60_000);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 3 || Object.keys(body).some(key => !["url", "details", "expected_details"].includes(key)) || typeof body.url !== "string" || body.url.length > 2048) throw new Error("PHOTO_INVALID");
    const saved = Array.isArray(context.salon.gallery_photos) ? context.salon.gallery_photos : [];
    if (!saved.includes(body.url)) throw new Error("PHOTO_NOT_FOUND");
    const details = validatePhotoDetails(body.details);
    const expected = body.expected_details === null ? null : validatePhotoDetails(body.expected_details);
    const moderation = await moderatePublicContent(context.admin, { name: details.title, body: details.caption });
    if (!moderation.allowed) throw new Error("PHOTO_CONTENT_REVIEW");
    const result = await context.admin.rpc("update_business_photo_details", { p_salon: context.salon.id, p_user: context.user.id, p_url: body.url, p_details: details, p_expected: expected });
    if (result.error) throw result.error;
    return Response.json({ photo_metadata: result.data, verified: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error && typeof error === "object" && "message" in error ? String(error.message) : "";
    const known = ["PHOTO_INVALID", "PHOTO_NOT_FOUND", "PHOTO_STALE", "PHOTO_CONTENT_REVIEW", "PHOTO_ACCESS_DENIED", "PHOTO_PLAN_REQUIRED"].includes(code);
    const status = code === "PHOTO_STALE" ? 409 : code === "PHOTO_NOT_FOUND" ? 404 : /ACCESS_DENIED|PLAN_REQUIRED|Forbidden/.test(code) ? 403 : /Unauthorized/.test(code) ? 401 : known ? 400 : 500;
    const reference = await capturePlatformError({ request, admin: context?.admin, error, feature: "business-photos", action: "save-details", actorRole: "salon", actorId: context?.user.id, salonId: context?.salon.id, safeMessage: "Photo details could not be saved.", severity: status >= 500 ? "high" : "low" });
    return Response.json({ code: known ? code : "PHOTO_UNAVAILABLE", request_id: reference }, { status, headers: { "Cache-Control": "private, no-store", "X-Request-ID": reference } });
  }
}
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/salon/photos", "PATCH"), handle);
