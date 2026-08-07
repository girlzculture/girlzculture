import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const currentSalonFields = new Set([
  "name",
  "owner_name",
  "email",
  "phone",
  "address_street",
  "address_line2",
  "address_city",
  "address_state",
  "address_zip",
  "business_type",
]);

const snapshotFields = new Set([
  "business_name",
  "owner_name",
  "business_email",
  "phone",
  "street_address",
  "address_line2",
  "city",
  "state",
  "zip_code",
  "business_type",
  "referral_source",
  "website_url",
  "instagram_url",
  "business_license_number",
  "cosmetology_license_number",
  "years_in_operation",
  "stylist_count",
]);

function objectPatch(value: unknown, allowed: Set<string>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => allowed.has(key))
      .map(([key, fieldValue]) => [
        key,
        typeof fieldValue === "string"
          ? fieldValue.trim().slice(0, 1000)
          : fieldValue,
      ]),
  );
}

function friendlyActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (
    /permission|Super Admin|reason|confirm|not found|restore|archive|already|active salon-owner|valid two-letter|ZIP code|word limit/i.test(
      message,
    )
  ) {
    return message;
  }
  return "This submission action could not be completed. Nothing was changed.";
}

async function applicationDetail(
  admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"],
  id: string,
) {
  const { data: application, error } = await admin
    .from("salon_applications")
    .select(
      "*,salon:salons(id,name,status,owner_name,email,phone,address_street,address_line2,address_city,address_state,address_zip,business_type,subscription_tier,subscription_status,is_discoverable,deleted_at,deletion_reason)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!application) return null;
  const [revisionResult, auditResult] = await Promise.all([
    admin
      .from("salon_application_revisions")
      .select(
        "id,revision_number,change_source,reason,changed_by,created_at,snapshot",
      )
      .eq("application_id", id)
      .order("revision_number", { ascending: false })
      .limit(50),
    admin
      .from("record_management_events")
      .select(
        "id,action,reason,acting_user_id,created_at,before_values,after_values,dependency_summary",
      )
      .eq("record_type", "salon_application")
      .eq("record_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (revisionResult.error) throw revisionResult.error;
  if (auditResult.error) throw auditResult.error;
  return {
    ...application,
    document_count: Array.isArray(application.document_urls)
      ? application.document_urls.length
      : 0,
    document_urls: undefined,
    revisions: revisionResult.data || [],
    audit_events: auditResult.data || [],
  };
}

async function GETHandler(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    enforceRateLimit(request, "admin-submission-detail", 120, 60_000);
    const { admin, adminUser } = await requireAdminPermission(
      request,
      "submissions",
    );
    const { id } = await context.params;
    if (!UUID.test(id))
      return Response.json({ error: "Application not found." }, { status: 404 });
    const application = await applicationDetail(admin, id);
    if (!application)
      return Response.json({ error: "Application not found." }, { status: 404 });
    return Response.json(
      {
        application,
        is_super_admin: Boolean(
          (adminUser as { is_super_admin?: boolean }).is_super_admin,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    noteOperationalFailure("Admin application detail load failed", error);
    const message = friendlyActionError(error);
    return Response.json(
      { error: message },
      { status: /permission/i.test(message) ? 403 : 500 },
    );
  }
}

async function POSTHandler(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    enforceRateLimit(request, "admin-submission-action", 60, 60_000);
    const { admin, user, adminUser } = await requireAdminPermission(
      request,
      "submissions",
    );
    const { id } = await context.params;
    if (!UUID.test(id))
      return Response.json({ error: "Application not found." }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    const action = cleanText(body.action, 40);
    const reason = cleanText(body.reason, 1000);

    if (action === "document") {
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0 || index > 20)
        return Response.json({ error: "Choose a document." }, { status: 400 });
      const { data: application, error } = await admin
        .from("salon_applications")
        .select("document_urls")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const paths = Array.isArray(application?.document_urls)
        ? application.document_urls.map(String)
        : [];
      const path = paths[index];
      if (!path)
        return Response.json({ error: "Document not found." }, { status: 404 });
      if (/^https:\/\//i.test(path)) return Response.json({ url: path });
      const signed = await admin.storage
        .from("application-documents")
        .createSignedUrl(path, 15 * 60);
      if (signed.error) throw signed.error;
      return Response.json({ url: signed.data.signedUrl });
    }

    let result;
    if (action === "archive") {
      result = await admin.rpc("admin_archive_salon_application", {
        p_application_id: id,
        p_actor_user_id: user.id,
        p_reason: reason,
      });
    } else if (action === "restore") {
      result = await admin.rpc("admin_restore_salon_application", {
        p_application_id: id,
        p_actor_user_id: user.id,
        p_reason: reason,
      });
    } else if (action === "update_current") {
      const patch = objectPatch(body.patch, currentSalonFields);
      if (!Object.keys(patch).length)
        return Response.json({ error: "Enter at least one change." }, { status: 400 });
      result = await admin.rpc("admin_update_submission_current_salon", {
        p_application_id: id,
        p_actor_user_id: user.id,
        p_patch: patch,
        p_reason: reason,
      });
    } else if (action === "update_snapshot") {
      if (!(adminUser as { is_super_admin?: boolean }).is_super_admin)
        return Response.json(
          { error: "Only a Super Admin can correct a submitted snapshot." },
          { status: 403 },
        );
      const patch = objectPatch(body.patch, snapshotFields);
      if (!Object.keys(patch).length)
        return Response.json({ error: "Enter at least one change." }, { status: 400 });
      result = await admin.rpc("admin_update_salon_application_snapshot", {
        p_application_id: id,
        p_actor_user_id: user.id,
        p_patch: patch,
        p_reason: reason,
      });
    } else if (action === "delete_application") {
      if (!(adminUser as { is_super_admin?: boolean }).is_super_admin)
        return Response.json(
          { error: "Only a Super Admin can permanently delete an application." },
          { status: 403 },
        );
      const confirmation = cleanText(body.confirmation, 260);
      result = await admin.rpc("admin_delete_salon_application", {
        p_application_id: id,
        p_actor_user_id: user.id,
        p_reason: reason,
        p_confirmation: confirmation,
        p_dependency_summary: { source: "submissions_detail" },
      });
    } else if (action === "delete_salon") {
      if (!(adminUser as { is_super_admin?: boolean }).is_super_admin)
        return Response.json(
          { error: "Only a Super Admin can permanently remove a salon." },
          { status: 403 },
        );
      const { data: application, error } = await admin
        .from("salon_applications")
        .select("salon_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!application?.salon_id)
        return Response.json({ error: "Current salon not found." }, { status: 404 });
      const confirmation = cleanText(body.confirmation, 260);
      result = await admin.rpc("admin_operationally_delete_salon", {
        p_salon_id: application.salon_id,
        p_actor_user_id: user.id,
        p_reason: reason,
        p_confirmation: confirmation,
        p_dependency_summary: { source_application_id: id },
      });
    } else {
      return Response.json({ error: "Choose a valid submission action." }, { status: 400 });
    }

    if (result.error) throw result.error;
    const refreshed = ["delete_application", "delete_salon"].includes(action)
      ? null
      : await applicationDetail(admin, id);
    return Response.json(
      { ok: true, result: result.data, application: refreshed },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    noteOperationalFailure("Admin application action failed", error);
    const message = friendlyActionError(error);
    return Response.json(
      { error: message },
      { status: /permission|Super Admin/i.test(message) ? 403 : 409 },
    );
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/submissions/[id]", "GET", {
    classification: "protected",
    feature: "submissions",
    actorRole: "admin",
    safeMessage: "We couldn't load this salon application.",
  }),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/submissions/[id]", "POST", {
    classification: "protected",
    feature: "submissions",
    actorRole: "admin",
    safeMessage: "We couldn't update this salon application.",
  }),
  POSTHandler,
);
