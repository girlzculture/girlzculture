import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  mediaRequestId,
  prepareMediaUpload,
} from "@/lib/mediaUploadServer";
import { expectedMediaRequestFailure } from "@/lib/mediaUploadErrorCore";
import type { MediaPrepareRequest } from "@/lib/mediaUploadProtocol";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  const requestId = mediaRequestId();
  let admin: ReturnType<typeof getSupabaseAdmin> | undefined;
  try {
    let body: MediaPrepareRequest;
    try {
      body = (await request.json()) as MediaPrepareRequest;
    } catch {
      return Response.json(
        { error: "Send a valid JSON image-upload request." },
        {
          status: 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    admin = getSupabaseAdmin();
    const prepared = await prepareMediaUpload(request, body);
    return Response.json(
      {
        upload_id: prepared.uploadId,
        uploads: prepared.uploads,
        expires_at: prepared.expiresAt,
        request_id: requestId,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const expected = expectedMediaRequestFailure(error);
    if (expected) {
      return Response.json(
        { error: expected.message },
        {
          status: expected.status,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "media",
      action: "prepare_direct_image_upload",
      actorRole: "authenticated",
      safeMessage: "We couldn't prepare this image upload.",
    });
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/media/upload/prepare", "POST"),
  POSTHandler,
);
