import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { resetHash } from "@/lib/passwordResetServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "password-reset-complete", 8, 15 * 60_000);
    const body = await request.json() as Record<string, unknown>;
    const requestId = cleanText(body.request_id, 50); const ticket = cleanText(body.ticket, 200); const password = String(body.password || "");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) throw new Error("Use at least 8 characters with a letter and a number.");
    const admin = getSupabaseAdmin();
    const { data: row, error } = await admin.from("password_reset_codes").select("*").eq("id", requestId).maybeSingle();
    if (error || !row || row.used_at || !row.verified_at || !row.ticket_hash || row.ticket_hash !== resetHash(ticket) || new Date(row.expires_at).getTime() < Date.now()) throw new Error("This reset session is invalid or expired.");
    const { error: authError } = await admin.auth.admin.updateUserById(row.user_id, { password });
    if (authError) throw authError;
    await admin.from("password_reset_codes").update({ used_at: new Date().toISOString(), ticket_hash: null }).eq("id", requestId);
    return Response.json({ ok: true });
  } catch (error) { noteOperationalFailure("Password reset completion failed", error); return errorResponse(error, "Unable to update password."); }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/auth/password-reset/complete", "POST"), POSTHandler);
