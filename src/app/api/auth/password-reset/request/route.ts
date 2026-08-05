import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanEmail, enforceRateLimit, errorResponse, rejectBot } from "@/lib/requestSecurity";
import { createResetCode, findAuthUserByEmail, resetHash } from "@/lib/passwordResetServer";
import { getSupabaseAdmin, sendEmail, sendSms } from "@/lib/supabaseAdmin";
import { resolveSmsResetDestination } from "@/lib/passwordResetIdentityCore";

const RESET_REQUEST_MESSAGE =
  "If an account matches those details, a reset code is on the way.";

function genericResetResponse(requestId = crypto.randomUUID()) {
  return Response.json({ ok: true, requestId, message: RESET_REQUEST_MESSAGE });
}

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "password-reset-request", 5, 15 * 60_000);
    const body = await request.json() as Record<string, unknown>; rejectBot(body);
    const email = cleanEmail(body.email); const channel = body.channel === "sms" ? "sms" : "email";
    let publicRequestId = crypto.randomUUID();
    try {
      const user = await findAuthUserByEmail(email);
      if (!user) return genericResetResponse(publicRequestId);

      const smsDestination =
        channel === "sms"
          ? resolveSmsResetDestination(user, body.phone)
          : null;
      if (channel === "sms" && !smsDestination?.eligible) {
        return genericResetResponse(publicRequestId);
      }

      const code = createResetCode();
      const admin = getSupabaseAdmin();
      const canonicalEmail = cleanEmail(user.email);
      const canonicalPhone = smsDestination?.canonicalPhone || "";
      await admin.from("password_reset_codes").update({ used_at: new Date().toISOString() }).eq("user_id", user.id).is("used_at", null);
      const { data, error } = await admin.from("password_reset_codes").insert({ user_id: user.id, email: canonicalEmail, phone: canonicalPhone || null, channel, code_hash: resetHash(code) }).select("id").single();
      if (error) throw error;
      publicRequestId = data.id;
      if (channel === "sms") {
        const delivery = await sendSms(canonicalPhone, `Girlz Culture password reset code: ${code}. It expires in 10 minutes.`) as { skipped?: boolean };
        if (delivery?.skipped) throw new Error("SMS reset delivery is not configured yet.");
      } else {
        const delivery = await sendEmail(canonicalEmail, "Your Girlz Culture password reset code", `<h1>Password reset</h1><p>Your one-time code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`, "security") as { skipped?: boolean };
        if (delivery?.skipped) throw new Error("Email reset delivery is not configured yet.");
      }
      return genericResetResponse(publicRequestId);
    } catch (error) {
      // Account lookup, database, and provider outcomes intentionally share the
      // same public response so this endpoint cannot enumerate identities.
      noteOperationalFailure("Password reset delivery failed", error);
      return genericResetResponse(publicRequestId);
    }
  } catch (error) { noteOperationalFailure("Password reset request failed", error); return errorResponse(error, "Unable to send reset code."); }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/auth/password-reset/request", "POST"), POSTHandler);
