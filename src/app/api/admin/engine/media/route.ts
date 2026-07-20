import { requireAdminPermission } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "settings");
    const { data, error } = await admin.from("media_upload_profiles").select("*").order("display_name");
    if (error) throw error;
    return Response.json({ profiles: data || [] });
  } catch (error) { console.error("Media profile load failed", error); return Response.json({ error: error instanceof Error ? error.message : "Unable to load media rules." }, { status: 403 }); }
}

export async function PATCH(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "settings");
    const body = await request.json() as { profile_key?: string; min_width_px?: number; min_height_px?: number; output_width_px?: number; max_bytes?: number; help_text?: string; safe_area_enabled?: boolean };
    const key = String(body.profile_key || "");
    if (!/^[a-z_]{2,30}$/.test(key)) throw new Error("Choose a valid media placement.");
    const positive = (value: unknown, min: number, max: number, label: string) => { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} must be between ${min} and ${max}.`); return parsed; };
    const update = { min_width_px: positive(body.min_width_px, 200, 8000, "Minimum width"), min_height_px: positive(body.min_height_px, 200, 8000, "Minimum height"), output_width_px: positive(body.output_width_px, 400, 4000, "Output width"), max_bytes: positive(body.max_bytes, 102400, 12582912, "Maximum bytes"), help_text: String(body.help_text || "").trim().slice(0, 500), safe_area_enabled: Boolean(body.safe_area_enabled), updated_by: user.id, updated_at: new Date().toISOString() };
    const { data: before } = await admin.from("media_upload_profiles").select("*").eq("profile_key", key).single();
    const { data, error } = await admin.from("media_upload_profiles").update(update).eq("profile_key", key).select().single(); if (error) throw error;
    await admin.from("admin_security_events").insert({ actor_user_id: user.id, action: "media_profile_updated", details: { profile_key: key, before: before || {}, after: data, reason: "Media placement rules updated in Engine" } });
    return Response.json({ profile: data });
  } catch (error) { console.error("Media profile save failed", error); return Response.json({ error: error instanceof Error ? error.message : "Unable to save media rules." }, { status: 400 }); }
}
