import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";

type DiagnosticCheck = {
  label?: string;
  required?: boolean;
  passed?: boolean;
  action?: string;
  current?: number;
  target?: number;
};

async function evaluate(
  request: Request,
  action: "load" | "refresh" | "finish" | "set_sole_stylist" = "load",
  soleStylistValue?: boolean,
) {
  const { admin, salon, isOwner } = await requireSalonOwner(request);
  if (!isOwner) throw new Error("Only the salon owner can complete marketplace onboarding.");

  if (action === "set_sole_stylist") {
    const { error } = await admin.from("salons").update({ owner_is_sole_stylist: soleStylistValue === true }).eq("id", salon.id);
    if (error) throw error;
  }

  const { data, error } = await admin.rpc("reconcile_salon_publication", {
    p_salon_id: salon.id,
    p_actor_id: null,
    p_reason: action === "finish" ? "Salon owner requested setup completion" : "Salon setup checklist refreshed",
  });
  if (error) throw error;
  const diagnostic = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const checks = diagnostic.checks && typeof diagnostic.checks === "object"
    ? diagnostic.checks as Record<string, DiagnosticCheck>
    : {};
  const missing = Object.entries(checks)
    .filter(([, check]) => check.required === true && check.passed !== true)
    .map(([key, check]) => ({ key, label: check.label || key, action: check.action || "/salon/dashboard" }));
  const currentStatus = String(diagnostic.status || salon.status || "Pending");
  const discoverable = diagnostic.is_discoverable === true;

  return Response.json({
    salon: {
      id: salon.id,
      name: diagnostic.salon_name || salon.name,
      slug: diagnostic.slug || salon.slug,
      status: currentStatus,
      subscription_status: diagnostic.subscription_status || salon.subscription_status,
    },
    checks,
    missing,
    progress: Number(diagnostic.progress || 0),
    checklist_complete: diagnostic.all_required_complete === true,
    discoverable,
    finished: action === "finish" && discoverable,
    owner_is_sole_stylist: action === "set_sole_stylist" ? soleStylistValue === true : salon.owner_is_sole_stylist === true,
    finish_blockers: missing.map((item) => item.label),
    eligibility: {
      approved: checks.application_approved?.passed === true,
      active_subscription: checks.active_subscription?.passed === true,
      active_status: currentStatus === "Active",
      precise_location: checks.precise_geocoding?.passed === true,
    },
    lifecycle: {
      auto_activation: diagnostic.auto_activation === true,
      loss_behavior: diagnostic.loss_behavior,
      grace_until: diagnostic.eligibility_grace_until,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

async function GETHandler(request: Request) {
  try {
    return await evaluate(request);
  } catch (error) {
    noteOperationalFailure("Salon onboarding evaluation failed", error);
    return errorResponse(error, "Unable to evaluate onboarding.");
  }
}

async function POSTHandler(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const requestedAction = String(body.action || "refresh");
    const action = (["refresh", "finish", "set_sole_stylist"].includes(requestedAction)
      ? requestedAction
      : "refresh") as "refresh" | "finish" | "set_sole_stylist";
    return await evaluate(request, action, body.owner_is_sole_stylist === true);
  } catch (error) {
    noteOperationalFailure("Salon onboarding refresh failed", error);
    return errorResponse(error, "Unable to refresh onboarding.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/onboarding", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/onboarding", "POST"), POSTHandler);
