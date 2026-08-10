import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  monitoredRouteFailure,
  rejectRequest,
} from "@/lib/platformErrors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  APPLICATION_DOCUMENT_BUCKET,
  ApplicationDocumentInputError,
  applicationDocumentDescriptor,
  applicationDocumentSignatureMatches,
  verifyApplicationDocumentPath,
} from "@/lib/applicationDocumentUploadCore";

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticatedApplicant(
  request: Request,
  admin: ReturnType<typeof getSupabaseAdmin>,
) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) rejectRequest("Please sign in again before uploading.", 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error) {
    const status = Number(
      (error as unknown as { status?: number }).status || 0,
    );
    if (status >= 500) throw error;
    rejectRequest("Please sign in again before uploading.", 401);
  }
  if (!data.user) rejectRequest("Please sign in again before uploading.", 401);
  const { data: salon, error: salonError } = await admin
    .from("salons")
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (salonError) throw salonError;
  if (!salon) {
    rejectRequest("Sign in with your salon applicant account.", 403);
  }
  return { user: data.user, salonId: String(salon.id) };
}

async function POSTHandler(request: Request) {
  let admin: ReturnType<typeof getSupabaseAdmin> | undefined;
  let actorId: string | null = null;
  let salonId: string | null = null;
  let uploadId: string | null = null;
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      rejectRequest("Send a valid supporting-document confirmation request.");
    }
    admin = getSupabaseAdmin();
    const applicant = await authenticatedApplicant(request, admin);
    const user = applicant.user;
    actorId = user.id;
    salonId = applicant.salonId;
    uploadId = String(body.upload_id || "");
    if (!UUID.test(uploadId)) {
      rejectRequest("The supporting-document upload reference is invalid.");
    }
    const descriptor = applicationDocumentDescriptor(body);
    const path = verifyApplicationDocumentPath(
      body.path,
      user.id,
      uploadId,
    );
    const folder = `${user.id}/documents`;
    const fileName = path.slice(`${folder}/`.length);
    const { data: storedFiles, error: listError } = await admin.storage
      .from(APPLICATION_DOCUMENT_BUCKET)
      .list(folder, { limit: 10, search: `${uploadId}-` });
    if (listError) throw listError;
    const storedFile = (storedFiles || []).find(
      (candidate) => candidate.name === fileName,
    );
    if (!storedFile) {
      rejectRequest(
        "The supporting document could not be verified. Upload it again.",
        409,
      );
    }
    const metadata =
      storedFile.metadata && typeof storedFile.metadata === "object"
        ? (storedFile.metadata as Record<string, unknown>)
        : {};
    const storedSize = Number(metadata.size || 0);
    const storedMimeType = String(
      metadata.mimetype || metadata.contentType || "",
    ).toLowerCase();
    if (
      storedSize !== descriptor.sizeBytes ||
      storedMimeType !== descriptor.mimeType
    ) {
      rejectRequest(
        "The supporting document does not match the selected file. Upload it again.",
      );
    }
    const { data: storedBlob, error: downloadError } = await admin.storage
      .from(APPLICATION_DOCUMENT_BUCKET)
      .download(path);
    if (downloadError) throw downloadError;
    if (!storedBlob || storedBlob.size !== descriptor.sizeBytes) {
      rejectRequest(
        "The supporting document could not be verified. Upload it again.",
        409,
      );
    }
    const signature = new Uint8Array(
      await storedBlob.slice(0, 16).arrayBuffer(),
    );
    if (
      !applicationDocumentSignatureMatches(signature, descriptor.mimeType)
    ) {
      rejectRequest(
        "The file contents do not match a supported PDF, JPG, or PNG document.",
      );
    }
    const finalized = await admin.rpc("finalize_application_document_upload", {
      p_upload_id: uploadId,
      p_user_id: user.id,
      p_salon_id: salonId,
      p_storage_path: path,
      p_mime_type: descriptor.mimeType,
      p_size_bytes: descriptor.sizeBytes,
    });
    if (finalized.error) {
      if (finalized.error.code === "42501") {
        rejectRequest(
          "Sign in with the salon-owner account that owns this application.",
          403,
        );
      }
      if (finalized.error.code === "22023") {
        rejectRequest(
          /expired/i.test(finalized.error.message || "")
            ? "This supporting-document upload expired. Upload the file again."
            : "The prepared supporting-document upload could not be verified.",
          409,
        );
      }
      throw finalized.error;
    }
    return Response.json(
      { uploaded: true, upload_id: uploadId, path },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof ApplicationDocumentInputError) {
      return Response.json(
        { error: error.message },
        {
          status: error.status,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "salon-application-documents",
      action: "finalize-upload",
      actorRole: "salon-applicant",
      actorId,
      salonId,
      recordType: "application_document_upload",
      recordId: uploadId,
      provider: "supabase-storage",
      safeMessage: "We couldn't finish saving this supporting document.",
    });
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile(
    "/api/salon/application/documents/finalize",
    "POST",
    {
      classification: "provider-backed",
      feature: "salon-application-documents",
      actorRole: "salon-applicant",
      provider: "supabase-storage",
      safeMessage: "We couldn't finish saving this supporting document.",
    },
  ),
  POSTHandler,
);
