import { cleanEmail, cleanText, errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "settings");
    const rawEmail = new URL(request.url).searchParams.get("email");
    let query = admin.from("identity_conflict_queue").select("*").order("email_normalized").limit(500);
    if (rawEmail) query = query.eq("email_normalized", cleanEmail(rawEmail));
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ conflicts: data || [] });
  } catch (error) {
    console.error("Identity conflict inventory load failed", error);
    return errorResponse(error, "Unable to load identity conflicts.");
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "settings");
    const body = await request.json() as Record<string, unknown>;
    const email = cleanEmail(body.email);
    const status = cleanText(body.status, 20);
    if (!['Open', 'Deferred'].includes(status)) {
      throw new Error("A conflict can be resolved only after its linked records have been safely reassigned or disabled.");
    }
    const reason = cleanText(body.reason, 1000);
    if (!reason) throw new Error("Add a review note before changing this conflict.");
    const { data, error } = await admin.from("identity_conflict_resolutions").upsert({
      email_normalized: email,
      status,
      reason,
      resolution_action: status === "Deferred" ? "deferred_for_manual_review" : "reopened",
      resolved_by: user.id,
      resolved_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "email_normalized" }).select().single();
    if (error) throw error;
    return Response.json({ resolution: data });
  } catch (error) {
    console.error("Identity conflict review update failed", error);
    return errorResponse(error, "Unable to update identity conflict review.");
  }
}
