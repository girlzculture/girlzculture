import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { createResetTicket, resetHash } from "@/lib/passwordResetServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "password-reset-verify", 10, 15 * 60_000);
    const body = await request.json() as Record<string, unknown>;
    const requestId = cleanText(body.request_id, 50); const code = cleanText(body.code, 6);
    if (!/^[0-9]{6}$/.test(code)) throw new Error("Enter the six-digit reset code.");
    const admin = getSupabaseAdmin();
    const { data: row, error } = await admin.from("password_reset_codes").select("*").eq("id", requestId).maybeSingle();
    if (error || !row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) throw new Error("That reset code is invalid or expired.");
    if (Number(row.attempts || 0) >= 5) throw new Error("Too many incorrect attempts. Request a new code.");
    if (row.code_hash !== resetHash(code)) { await admin.from("password_reset_codes").update({ attempts: Number(row.attempts || 0) + 1 }).eq("id", requestId); throw new Error("That reset code is invalid or expired."); }
    const ticket = createResetTicket();
    const { error: updateError } = await admin.from("password_reset_codes").update({ verified_at: new Date().toISOString(), ticket_hash: resetHash(ticket) }).eq("id", requestId);
    if (updateError) throw updateError;
    return Response.json({ ok: true, ticket });
  } catch (error) { noteOperationalFailure("Password reset verification failed", error); return errorResponse(error, "Unable to verify reset code."); }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/auth/password-reset/verify", "POST"), POSTHandler);
