import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ApplicationDocumentInputError,
  applicationDocumentUploadId,
} from "@/lib/applicationDocumentUploadCore";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  const admin = getSupabaseAdmin();
  let actorId: string | null = null;
  let salonId: string | null = null;
  let uploadId: string | null = null;
  try {
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();
    if (!token) rejectRequest("Please sign in again before removing this document.", 401);
    const { data, error } = await admin.auth.getUser(token);
    if (error) {
      const status = Number(
        (error as unknown as { status?: number }).status || 0,
      );
      if (status >= 500) throw error;
      rejectRequest("Please sign in again before removing this document.", 401);
    }
    if (!data.user) {
      rejectRequest("Please sign in again before removing this document.", 401);
    }
    actorId = data.user.id;
    const { data: salon, error: salonError } = await admin
      .from("salons")
      .select("id")
      .eq("user_id", actorId)
      .maybeSingle();
    if (salonError) throw salonError;
    if (!salon) rejectRequest("Sign in with your salon applicant account.", 403);
    salonId = String(salon.id);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      rejectRequest("Send a valid supporting-document removal request.");
    }
    uploadId = applicationDocumentUploadId(body.path, actorId);
    const abandoned = await admin.rpc("abandon_application_document_upload", {
      p_upload_id: uploadId,
      p_user_id: actorId,
      p_salon_id: salonId,
    });
    if (abandoned.error) {
      if (abandoned.error.code === "42501") {
        rejectRequest(
          "Sign in with the salon-owner account that owns this application.",
          403,
        );
      }
      throw abandoned.error;
    }
    if (abandoned.data !== true) {
      rejectRequest("This supporting document is no longer pending.", 409);
    }
    // Storage deletion is intentionally performed by the bounded scheduled
    // cleanup.  The durable abandonment above immediately releases quota, and
    // a provider outage cannot put the database state back into use.
    return Response.json(
      { abandoned: true, upload_id: uploadId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof ApplicationDocumentInputError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "salon-application-documents",
      action: "abandon-upload",
      actorRole: "salon-applicant",
      actorId,
      salonId,
      recordType: "application_document_upload",
      recordId: uploadId,
      safeMessage: "We couldn't remove this supporting document.",
    });
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile(
    "/api/salon/application/documents/abandon",
    "POST",
    {
      classification: "provider-backed",
      feature: "salon-application-documents",
      actorRole: "salon-applicant",
      safeMessage: "We couldn't remove this supporting document.",
    },
  ),
  POSTHandler,
);
