import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  authenticateMediaRequest,
  authorizeMediaUpload,
  mediaRequestId,
  verifyPreparedMediaObjects,
} from "@/lib/mediaUploadServer";
import { preparedMediaProfileSnapshot } from "@/lib/mediaUploadProfileSnapshotCore";
import { expectedMediaRequestFailure } from "@/lib/mediaUploadErrorCore";
import { isUuid } from "@/lib/mediaUploadProtocol";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  const requestId = mediaRequestId();
  let admin: ReturnType<typeof getSupabaseAdmin> | undefined;
  try {
    let body: { upload_id?: string };
    try {
      body = (await request.json()) as { upload_id?: string };
    } catch {
      return Response.json(
        { error: "Send a valid JSON image-finalization request." },
        {
          status: 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    const uploadId = String(body.upload_id || "");
    if (!isUuid(uploadId)) {
      return Response.json(
        { error: "The upload reference is invalid." },
        {
          status: 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    admin = getSupabaseAdmin();
    const authenticatedUser = await authenticateMediaRequest(request, admin);
    const { data: session, error: sessionError } = await admin
      .from("media_upload_sessions")
      .select("*")
      .eq("id", uploadId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("The upload session was not found.");
    if (session.owner_user_id !== authenticatedUser.id) {
      throw new Error("Forbidden: this upload belongs to another account.");
    }
    const context = await authorizeMediaUpload(
      request,
      String(session.destination_bucket),
      String(session.destination_folder || ""),
    );
    if (session.owner_user_id !== context.user.id) {
      throw new Error("Forbidden: this upload belongs to another account.");
    }
    if (session.status === "Finalized" && session.finalized_asset_id) {
      const { data: asset, error: assetError } = await admin
        .from("media_assets")
        .select("id,public_url,status")
        .eq("id", session.finalized_asset_id)
        .single();
      if (assetError) throw assetError;
      return Response.json(
        {
          asset_id: asset.id,
          url: asset.public_url,
          status: asset.status,
          attached: asset.status === "Attached",
          request_id: requestId,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (
      session.status !== "Prepared" ||
      new Date(String(session.expires_at)).getTime() <= Date.now()
    ) {
      throw new Error("The upload session is no longer available.");
    }
    const profile = preparedMediaProfileSnapshot(
      session.crop_metadata,
      String(session.media_kind) as Parameters<
        typeof preparedMediaProfileSnapshot
      >[1],
    );
    const verified = await verifyPreparedMediaObjects(
      admin,
      session.expected_objects,
      session.crop_metadata,
      profile,
    );
    const result = await admin.rpc("finalize_media_upload_session", {
      p_session_id: uploadId,
      p_verified_objects: verified,
    });
    if (result.error) throw result.error;
    const payload =
      result.data && typeof result.data === "object"
        ? (result.data as Record<string, unknown>)
        : {};
    if (!payload.url || !payload.asset_id) {
      throw new Error("The finalized image could not be verified.");
    }
    return Response.json(
      {
        asset_id: payload.asset_id,
        url: payload.url,
        status: payload.status,
        attached: payload.attached === true,
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
      action: "finalize_direct_image_upload",
      actorRole: "authenticated",
      safeMessage: "We couldn't finish saving this image.",
    });
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/media/upload/finalize", "POST"),
  POSTHandler,
);
