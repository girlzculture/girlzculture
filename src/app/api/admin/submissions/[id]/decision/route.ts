import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { normalizePlan } from "@/lib/plans";
import {
  pilotOverrideReasonError,
  publicationBlockMessage,
  publicationGateFailures,
  publicationOverriddenGateLabels,
  type PublicationDiagnostic,
} from "@/lib/publicationActivationCore";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission, sendEmail } from "@/lib/supabaseAdmin";
import { serverSiteUrl } from "@/lib/siteUrlServer";

async function POSTHandler(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    enforceRateLimit(request, "admin-submission-decision", 30, 60_000);
    const { admin, user } = await requireAdminPermission(
      request,
      "submissions",
    );
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const decision = cleanText(body.decision, 20);
    if (!["approve", "reject", "activate"].includes(decision))
      return Response.json({ error: "Invalid decision" }, { status: 400 });
    const { data: application, error } = await admin
      .from("salon_applications")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !application)
      return Response.json({ error: "Application not found" }, { status: 404 });
    if (application.archived_at) {
      return Response.json(
        { error: "Restore this application before making a decision." },
        { status: 409 },
      );
    }

    const safeReason = cleanText(body.reason, 1_000) || null;
    const usePilotOverride =
      decision === "activate" && body.pilot_override === true;
    if (decision === "reject" && (!safeReason || safeReason.length < 5)) {
      return Response.json(
        { error: "Enter a rejection reason of at least 5 characters." },
        { status: 400 },
      );
    }
    if (usePilotOverride) {
      const reasonError = pilotOverrideReasonError(safeReason);
      if (reasonError) return Response.json({ error: reasonError }, { status: 400 });
    }

    const plan = normalizePlan(application.selected_plan);
    let status = "Approved";
    let changed = true;
    let lifecycle: PublicationDiagnostic | null = null;
    let overrideActive = false;
    let overriddenGates: string[] = [];
    let overriddenGateLabels: string[] = [];

    if (decision === "approve") {
      const approval = await admin.rpc("approve_salon_application", {
        p_application_id: application.id,
        p_actor_id: user.id,
      });
      if (approval.error) throw approval.error;
      changed = approval.data?.changed !== false;
    } else if (decision === "activate") {
      const activation = await admin.rpc("admin_activate_salon_application", {
        p_application_id: application.id,
        p_actor_id: user.id,
        p_use_pilot_override: usePilotOverride,
        p_reason: safeReason,
      });
      if (activation.error) throw activation.error;
      const result =
        activation.data && typeof activation.data === "object"
          ? (activation.data as Record<string, unknown>)
          : {};
      lifecycle =
        result.lifecycle && typeof result.lifecycle === "object"
          ? (result.lifecycle as PublicationDiagnostic)
          : null;
      const missing = publicationGateFailures(lifecycle);
      if (result.ok !== true) {
        const code = String(result.code || "PUBLICATION_GATES_INCOMPLETE");
        return Response.json(
          {
            error:
              code === "PUBLICATION_GATES_INCOMPLETE"
                ? publicationBlockMessage(missing)
                : typeof result.message === "string"
                  ? result.message
                  : publicationBlockMessage(missing),
            code,
            lifecycle,
            missing,
          },
          { status: 409, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      status = "Active";
      changed = result.changed !== false;
      overrideActive = result.override_active === true;
      overriddenGates = Array.isArray(result.overridden_gates)
        ? result.overridden_gates.map(String)
        : [];
      overriddenGateLabels = publicationOverriddenGateLabels(lifecycle);
    } else {
      const rejection = await admin.rpc(
        "admin_reject_salon_application_atomic",
        {
          p_application_id: application.id,
          p_actor_user_id: user.id,
          p_reason: safeReason,
        },
      );
      if (rejection.error) throw rejection.error;
      status = "Rejected";
      changed = rejection.data?.changed !== false;
    }

    const base = serverSiteUrl(request);
    const subject =
      decision === "activate"
        ? "Your Girlz Culture salon is live"
        : decision === "approve"
          ? "Your Girlz Culture application is approved"
          : "Update on your Girlz Culture application";
    const html =
      decision === "activate"
        ? overrideActive
          ? `<h1>Your salon is live for the founding pilot</h1><p>An authorized Girlz Culture administrator published your salon for the pilot. Any remaining setup items will stay visible in your dashboard and do not change your real subscription or payment records.</p><p><a href="${base}/salon/dashboard">Open your dashboard</a></p>`
          : `<h1>Your salon is live</h1><p>Every required setup and eligibility gate passed. Clients can now discover and book your salon.</p><p><a href="${base}/salon/dashboard">Open your dashboard</a></p>`
        : decision === "approve"
          ? `<h1>You’re approved</h1><p>Log in to activate your ${plan} subscription and complete the marketplace setup checklist. Your salon will remain private until every required gate passes.</p><p><a href="${base}/salon/login">Continue setup</a></p>`
          : `<h1>Application update</h1><p>We’re unable to approve your salon at this time.</p><p><strong>Reason:</strong> ${safeReason}</p>`;
    if (changed) {
      try {
        await sendEmail(application.business_email, subject, html, "account");
      } catch (emailError) {
        noteOperationalFailure("Application decision email failed", emailError);
      }
    }
    return Response.json({
      ok: true,
      status,
      plan,
      changed,
      idempotent: !changed,
      lifecycle,
      override_active: overrideActive,
      overridden_gates: overriddenGates,
      overridden_gate_labels: overriddenGateLabels,
    });
  } catch (error) {
    noteOperationalFailure("Application decision failed", error);
    return errorResponse(error, "Request failed");
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/submissions/[id]/decision", "POST"),
  POSTHandler,
);
