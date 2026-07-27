import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { normalizePlan } from "@/lib/plans";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission, sendEmail } from "@/lib/supabaseAdmin";

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    enforceRateLimit(request, "admin-submission-decision", 30, 60_000);
    const { admin, user } = await requireAdminPermission(request, "submissions");
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const decision = cleanText(body.decision, 20);
    if (!["approve", "reject", "activate"].includes(decision)) return Response.json({ error: "Invalid decision" }, { status: 400 });
    const { data: application, error } = await admin.from("salon_applications").select("*").eq("id", id).single();
    if (error || !application) return Response.json({ error: "Application not found" }, { status: 404 });

    const safeReason = cleanText(body.reason, 1_000) || null;
    if (decision === "reject" && (!safeReason || safeReason.length < 5)) throw new Error("Enter a rejection reason of at least 5 characters.");
    const plan = normalizePlan(application.selected_plan);
    const reviewedAt = new Date().toISOString();
    let status = "Approved";
    let changed = true;

    if (decision === "approve") {
      const approval = await admin.rpc("approve_salon_application", {
        p_application_id: application.id,
        p_actor_id: user.id,
      });
      if (approval.error) throw approval.error;
      changed = approval.data?.changed !== false;
    } else if (decision === "activate") {
      const diagnostic = await admin.rpc("salon_publication_diagnostic", {
        p_salon_id: application.salon_id,
      });
      if (diagnostic.error) throw diagnostic.error;
      const checks =
        diagnostic.data?.checks && typeof diagnostic.data.checks === "object"
          ? diagnostic.data.checks as Record<string, { required?: boolean; passed?: boolean; label?: string }>
          : {};
      const missing = Object.values(checks)
        .filter((check) => check.required === true && check.passed !== true)
        .map((check) => check.label || "Marketplace requirement");
      return Response.json(
        {
          error: missing.length
            ? `The application is approved, but the salon is not public yet. Complete: ${missing.join(", ")}.`
            : "Every marketplace requirement is complete. Publication is automatic; use the lifecycle panel to recheck if the salon is not yet visible.",
          code: "MARKETPLACE_ACTIVATION_IS_AUTOMATIC",
          lifecycle: diagnostic.data,
          missing,
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    } else {
      const offboard = await admin.rpc("admin_change_salon_status", {
        acting_admin_id: user.id,
        target_salon_id: application.salon_id,
        requested_status: "Offboarded",
        internal_reason: safeReason,
      });
      if (offboard.error) throw offboard.error;
      status = "Rejected";
    }

    if (decision !== "approve") {
      const { error: applicationError } = await admin.from("salon_applications").update({
        status,
        rejection_reason: decision === "reject" ? safeReason : null,
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
      }).eq("id", id);
      if (applicationError) throw applicationError;
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const subject = decision === "activate"
      ? "Your Girlz Culture salon is live"
      : decision === "approve"
        ? "Your Girlz Culture application is approved"
        : "Update on your Girlz Culture application";
    const html = decision === "activate"
      ? `<h1>Your salon is live</h1><p>Every required setup and eligibility gate passed. Clients can now discover and book your salon.</p><p><a href="${base}/salon/dashboard">Open your dashboard</a></p>`
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
    return Response.json({ ok: true, status, plan, changed, idempotent: !changed });
  } catch (error) {
    noteOperationalFailure("Application decision failed", error);
    return errorResponse(error, "Request failed");
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/submissions/[id]/decision", "POST"), POSTHandler);
