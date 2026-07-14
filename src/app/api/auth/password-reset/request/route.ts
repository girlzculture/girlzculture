import { cleanEmail, cleanUsPhone, enforceRateLimit, errorResponse, rejectBot } from "@/lib/requestSecurity";
import { createResetCode, findAuthUserByEmail, resetHash } from "@/lib/passwordResetServer";
import { getSupabaseAdmin, sendEmail, sendSms } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "password-reset-request", 5, 15 * 60_000);
    const body = await request.json() as Record<string, unknown>; rejectBot(body);
    const email = cleanEmail(body.email); const channel = body.channel === "sms" ? "sms" : "email";
    const user = await findAuthUserByEmail(email);
    if (!user) return Response.json({ ok: true, requestId: crypto.randomUUID(), message: "If an account matches those details, a reset code is on the way." });
    const knownPhone = user.phone || String(user.user_metadata?.phone || "");
    const phone = channel === "sms" ? cleanUsPhone(body.phone || knownPhone) : "";
    if (channel === "sms" && knownPhone && cleanUsPhone(knownPhone) !== phone) throw new Error("The phone number does not match this account.");
    const code = createResetCode(); const admin = getSupabaseAdmin();
    await admin.from("password_reset_codes").update({ used_at: new Date().toISOString() }).eq("user_id", user.id).is("used_at", null);
    const { data, error } = await admin.from("password_reset_codes").insert({ user_id: user.id, email, phone: phone || null, channel, code_hash: resetHash(code) }).select("id").single();
    if (error) throw error;
    if (channel === "sms") {
      const delivery = await sendSms(phone, `Girlz Culture password reset code: ${code}. It expires in 10 minutes.`) as { skipped?: boolean };
      if (delivery?.skipped) throw new Error("SMS reset delivery is not configured yet.");
    } else {
      const delivery = await sendEmail(email, "Your Girlz Culture password reset code", `<h1>Password reset</h1><p>Your one-time code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`, "security") as { skipped?: boolean };
      if (delivery?.skipped) throw new Error("Email reset delivery is not configured yet.");
    }
    return Response.json({ ok: true, requestId: data.id, message: `A reset code was sent by ${channel === "sms" ? "text message" : "email"}.` });
  } catch (error) { console.error("Password reset request failed", error); return errorResponse(error, "Unable to send reset code."); }
}
