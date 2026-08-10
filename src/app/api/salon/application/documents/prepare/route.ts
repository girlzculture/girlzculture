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
  applicationDocumentPath,
} from "@/lib/applicationDocumentUploadCore";

export const runtime = "nodejs";

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
      rejectRequest("Send a valid supporting-document upload request.");
    }
    admin = getSupabaseAdmin();
    const applicant = await authenticatedApplicant(request, admin);
    const user = applicant.user;
    actorId = user.id;
    salonId = applicant.salonId;
    const descriptor = applicationDocumentDescriptor(body);
    uploadId = crypto.randomUUID();
    const path = applicationDocumentPath(
      user.id,
      uploadId,
      descriptor.fileName,
    );
    const prepared = await admin.rpc("prepare_application_document_upload", {
      p_upload_id: uploadId,
      p_user_id: user.id,
      p_salon_id: salonId,
      p_storage_path: path,
      p_file_name: descriptor.fileName,
      p_mime_type: descriptor.mimeType,
      p_size_bytes: descriptor.sizeBytes,
    });
    if (prepared.error) {
      if (prepared.error.code === "42501") {
        rejectRequest(
          "Sign in with the salon-owner account that owns this application.",
          403,
        );
      }
      if (prepared.error.code === "22023") {
        rejectRequest(
          /five pending/i.test(prepared.error.message || "")
            ? "You can have up to five pending supporting documents. Remove one before uploading another."
            : "The supporting-document upload request is invalid.",
          /five pending/i.test(prepared.error.message || "") ? 409 : 400,
        );
      }
      throw prepared.error;
    }
    const { data, error } = await admin.storage
      .from(APPLICATION_DOCUMENT_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error) {
      await admin.rpc("abandon_application_document_upload", {
        p_upload_id: uploadId,
        p_user_id: user.id,
        p_salon_id: salonId,
      });
      throw error;
    }
    if (!data?.token) {
      await admin.rpc("abandon_application_document_upload", {
        p_upload_id: uploadId,
        p_user_id: user.id,
        p_salon_id: salonId,
      });
      throw new Error("The signed document upload was not created.");
    }
    return Response.json(
      {
        upload_id: uploadId,
        bucket: APPLICATION_DOCUMENT_BUCKET,
        path,
        token: data.token,
      },
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
      action: "prepare-upload",
      actorRole: "salon-applicant",
      actorId,
      salonId,
      recordType: "application_document_upload",
      recordId: uploadId,
      provider: "supabase-storage",
      safeMessage: "We couldn't prepare this supporting document.",
    });
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile(
    "/api/salon/application/documents/prepare",
    "POST",
    {
      classification: "provider-backed",
      feature: "salon-application-documents",
      actorRole: "salon-applicant",
      provider: "supabase-storage",
      safeMessage: "We couldn't prepare this supporting document.",
    },
  ),
  POSTHandler,
);
