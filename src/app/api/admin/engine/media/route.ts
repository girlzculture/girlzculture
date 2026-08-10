import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { isClearlyExpectedMessage } from "@/lib/operationalMonitoringCore";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

async function GETHandler(request: Request) {
  const { admin } = await requireAdminPermission(request, "engine");
  const { data, error } = await admin.from("media_upload_profiles").select("*").order("display_name");
  if (error) throw error;
  return Response.json({ profiles: data || [] });
}

async function PATCHHandler(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "engine");
    const body = await request.json() as { profile_key?: string; min_width_px?: number; min_height_px?: number; output_width_px?: number; max_bytes?: number; help_text?: string; safe_area_enabled?: boolean };
    const key = String(body.profile_key || "");
    if (!/^[a-z_]{2,30}$/.test(key)) throw new Error("Choose a valid media placement.");
    const positive = (value: unknown, min: number, max: number, label: string) => { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} must be between ${min} and ${max}.`); return parsed; };
    const update = { min_width_px: positive(body.min_width_px, 200, 8000, "Minimum width"), min_height_px: positive(body.min_height_px, 200, 8000, "Minimum height"), output_width_px: positive(body.output_width_px, 400, 4000, "Output width"), max_bytes: positive(body.max_bytes, 102400, 12582912, "Maximum bytes"), help_text: String(body.help_text || "").trim().slice(0, 500), safe_area_enabled: Boolean(body.safe_area_enabled), updated_by: user.id, updated_at: new Date().toISOString() };
    const beforeResult = await admin.from("media_upload_profiles").select("*").eq("profile_key", key).single();
    if (beforeResult.error) throw beforeResult.error;
    const { data, error } = await admin.from("media_upload_profiles").update(update).eq("profile_key", key).select().single(); if (error) throw error;
    const audit = await admin.from("admin_security_events").insert({ actor_user_id: user.id, action: "media_profile_updated", details: { profile_key: key, before: beforeResult.data || {}, after: data, reason: "Media placement rules updated in Engine" } });
    if (audit.error) throw audit.error;
    return Response.json({ profile: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isClearlyExpectedMessage(message)) {
      return Response.json({ error: message }, { status: 400 });
    }
    throw error;
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/media", "GET"), GETHandler);
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/media", "PATCH"), PATCHHandler);
