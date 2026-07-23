import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

const BOOLEAN_GATES = [
  "application_approved",
  "business_name",
  "structured_address",
  "precise_geocoding",
  "logo",
  "cover_photo",
  "business_details",
  "priced_service",
  "active_stylist",
  "business_hours",
  "active_subscription",
  "payout_account",
  "agreements",
] as const;

function sanitize(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const requiredInput = input.required && typeof input.required === "object"
    ? input.required as Record<string, unknown>
    : {};
  const required: Record<string, boolean | number> = Object.fromEntries(
    BOOLEAN_GATES.map((key) => [key, requiredInput[key] === true]),
  );
  const gallery = Number(requiredInput.gallery_photos);
  required.gallery_photos = Number.isInteger(gallery) && gallery >= 0 && gallery <= 20 ? gallery : 3;
  const lossBehavior = cleanText(input.loss_behavior, 30);
  if (!["needs_attention", "hide_immediately", "grace_period"].includes(lossBehavior)) {
    throw new Error("Choose a valid loss-of-eligibility behavior.");
  }
  const graceDays = Number(input.grace_period_days);
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 90) {
    throw new Error("Grace period must be a whole number from 0 to 90 days.");
  }
  return {
    version: Number(input.version || 1) + 1,
    auto_activation: input.auto_activation === true,
    loss_behavior: lossBehavior,
    grace_period_days: graceDays,
    required,
  };
}

async function GETHandler(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "settings");
    const { data, error } = await admin.from("admin_settings").select("value,updated_at").eq("key", "salon_lifecycle").single();
    if (error) throw error;
    return Response.json({ config: data.value, updated_at: data.updated_at }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    noteOperationalFailure("Salon lifecycle settings load failed", error);
    return errorResponse(error, "Unable to load salon lifecycle settings.");
  }
}

async function PATCHHandler(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "settings");
    const config = sanitize(await request.json());
    const { error } = await admin.from("admin_settings").upsert({ key: "salon_lifecycle", value: config, updated_at: new Date().toISOString() });
    if (error) throw error;
    const { data: salons, error: salonError } = await admin.from("salons").select("id").limit(10_000);
    if (salonError) throw salonError;
    const failures: string[] = [];
    for (const salon of salons || []) {
      const result = await admin.rpc("reconcile_salon_publication", {
        p_salon_id: salon.id,
        p_actor_id: null,
        p_reason: "Platform lifecycle requirements changed",
      });
      if (result.error) failures.push(salon.id);
    }
    if (failures.length) noteOperationalFailure("Lifecycle settings reconciliation failures", { salonIds: failures });
    return Response.json({ config, reconciled: (salons || []).length - failures.length, failures: failures.length });
  } catch (error) {
    noteOperationalFailure("Salon lifecycle settings update failed", error);
    return errorResponse(error, "Unable to update salon lifecycle settings.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/lifecycle", "GET"), GETHandler);
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/lifecycle", "PATCH"), PATCHHandler);
