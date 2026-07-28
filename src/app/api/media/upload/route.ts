import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { getEngineNumber } from "@/lib/engineConfigServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  authenticateMediaRequest,
  authorizeMediaUpload,
  loadMediaProfile,
  mediaRequestId,
  removePreparedMediaObjects,
  syncMediaAttachment,
  validateMediaAttachment,
} from "@/lib/mediaUploadServer";
import { expectedMediaRequestFailure } from "@/lib/mediaUploadErrorCore";
import {
  isUuid,
  type MediaAttachment,
} from "@/lib/mediaUploadProtocol";
import type { ImagePresetKey } from "@/lib/imageUpload";

export const runtime = "nodejs";

async function GETHandler(request: Request) {
  const kind = new URL(request.url).searchParams.get(
    "kind",
  ) as ImagePresetKey | null;
  if (!kind) {
    return Response.json(
      { error: "Unknown media placement." },
      { status: 400 },
    );
  }
  try {
    const admin = getSupabaseAdmin();
    const [profile, quality] = await Promise.all([
      loadMediaProfile(admin, kind),
      getEngineNumber("media.public_image_quality", 88, 60, 100),
    ]);
    return Response.json(
      { profile: { ...profile, quality } },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (error) {
    noteOperationalFailure("Media upload profile lookup failed", error);
    return Response.json(
      { error: "This media placement is temporarily unavailable." },
      { status: 503 },
    );
  }
}

async function POSTHandler() {
  return Response.json(
    {
      error:
        "Binary uploads are no longer accepted by this route. Refresh the page and try again.",
    },
    {
      status: 410,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

async function PATCHHandler(request: Request) {
  const requestId = mediaRequestId();
  const admin = getSupabaseAdmin();
  try {
    let body: {
        bucket?: string;
        folder?: string;
        attachment?: MediaAttachment;
        urls?: string[];
      };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json(
        { error: "Send a valid JSON media request.", request_id: requestId },
        {
          status: 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    const bucket = String(body.bucket || "");
    const folder = String(body.folder || "");
    const context = await authorizeMediaUpload(request, bucket, folder);
    const attachment = await validateMediaAttachment(
      context,
      bucket,
      folder,
      body.attachment,
    );
    if (!attachment) throw new Error("The media attachment is invalid.");
    const persisted = await syncMediaAttachment(
      context,
      attachment,
      Array.isArray(body.urls) ? body.urls : [],
    );
    return Response.json(
      { persisted_urls: persisted, request_id: requestId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const expected = expectedMediaRequestFailure(error);
    if (expected) {
      return Response.json(
        { error: expected.message, request_id: requestId },
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
      action: "sync_attached_image_urls",
      actorRole: "authenticated",
      safeMessage: "We couldn't save this image change.",
    });
  }
}

async function DELETEHandler(request: Request) {
  const requestId = mediaRequestId();
  const admin = getSupabaseAdmin();
  try {
    let body: {
        url?: string;
        upload_id?: string;
        bucket?: string;
        folder?: string;
        attachment?: MediaAttachment;
      };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json(
        { error: "Send a valid JSON media request.", request_id: requestId },
        {
          status: 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    const uploadId = String(body.upload_id || "");
    if (uploadId) {
      if (!isUuid(uploadId)) throw new Error("The upload reference is invalid.");
      const authenticatedUser = await authenticateMediaRequest(request, admin);
      const { data: session, error: sessionError } = await admin
        .from("media_upload_sessions")
        .select("*")
        .eq("id", uploadId)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) {
        return Response.json(
          { removed: false, request_id: requestId },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      }
      if (session.owner_user_id !== authenticatedUser.id) {
        throw new Error("Forbidden: this upload belongs to another account.");
      }
      const context = await authorizeMediaUpload(
        request,
        String(session.destination_bucket),
        String(session.destination_folder || ""),
      );
      if (session.owner_user_id !== context.user.id) throw new Error("Forbidden");
      if (session.status === "Prepared") {
        await removePreparedMediaObjects(admin, session.expected_objects);
        await admin
          .from("media_upload_sessions")
          .update({
            status: "Failed",
            failure_code: "CLIENT_ABORTED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", uploadId)
          .eq("status", "Prepared");
      }
      return Response.json(
        { removed: true, request_id: requestId },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const url = String(body.url || "");
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    const { data: auth } = token
      ? await admin.auth.getUser(token)
      : { data: { user: null } };
    if (!auth.user) throw new Error("Unauthorized");
    const { data: asset, error } = await admin
      .from("media_assets")
      .select("*")
      .eq("public_url", url)
      .maybeSingle();
    if (error) throw error;
    if (!asset) {
      return Response.json({
        removed: false,
        reason: "The image is not managed by the media registry.",
        request_id: requestId,
      });
    }
    const assetFolder = String(asset.object_path || "")
      .split("/")
      .slice(0, -1)
      .join("/");
    const context = await authorizeMediaUpload(
      request,
      String(asset.bucket_id || ""),
      assetFolder,
    );
    if (
      asset.salon_id &&
      context.salon?.id !== asset.salon_id
    ) {
      throw new Error("Forbidden");
    }
    if (
      !asset.salon_id &&
      asset.bucket_id !== "content-media" &&
      asset.owner_user_id !== context.user.id
    ) {
      throw new Error("Forbidden");
    }
    if (asset.status !== "Staged") {
      await admin
        .from("media_assets")
        .update({ status: "Archived", archived_at: new Date().toISOString() })
        .eq("id", asset.id);
      return Response.json({
        removed: false,
        archived: true,
        reason: "The saved image was archived safely.",
        request_id: requestId,
      });
    }
    const renditionPaths = Object.values(
      (asset.renditions || {}) as Record<string, { path?: string }>,
    )
      .map((rendition) => rendition.path)
      .filter((path): path is string => Boolean(path));
    const paths = [
      ...new Set([asset.object_path, ...renditionPaths].filter(Boolean)),
    ];
    const { error: removeError } = await admin.storage
      .from(asset.bucket_id)
      .remove(paths);
    if (removeError) throw removeError;
    if (asset.source_bucket_id && asset.source_object_path) {
      const { error: sourceError } = await admin.storage
        .from(asset.source_bucket_id)
        .remove([asset.source_object_path]);
      if (sourceError) throw sourceError;
    }
    await admin.from("media_assets").delete().eq("id", asset.id);
    return Response.json(
      { removed: true, request_id: requestId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const expected = expectedMediaRequestFailure(error);
    if (expected) {
      return Response.json(
        { error: expected.message, request_id: requestId },
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
      action: "remove_direct_image_upload",
      actorRole: "authenticated",
      safeMessage:
        "The image was removed from the form, but storage cleanup needs attention.",
    });
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/media/upload", "GET"),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/media/upload", "POST"),
  POSTHandler,
);
export const PATCH = withOperationalMonitoring(
  routeMonitoringProfile("/api/media/upload", "PATCH"),
  PATCHHandler,
);
export const DELETE = withOperationalMonitoring(
  routeMonitoringProfile("/api/media/upload", "DELETE"),
  DELETEHandler,
);
