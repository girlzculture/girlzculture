import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function userFor(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return { admin, user: data.user };
}

export async function GET(request: Request) {
  try {
    const { admin, user } = await userFor(request);
    const { data, error } = await admin.from("account_security_settings").select("mfa_enabled,preferred_channel,verified_phone").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return Response.json({ mfa_enabled: Boolean(data?.mfa_enabled), preferred_channel: data?.preferred_channel || "email", verified_phone: data?.verified_phone || null });
  } catch (error) { return errorResponse(error, "Unable to load security settings."); }
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await userFor(request);
    const body = await request.json() as Record<string, unknown>;
    const channel = cleanText(body.preferred_channel, 10) === "sms" ? "sms" : "email";
    if (channel === "sms") throw new Error("Verify a mobile number before selecting SMS. Email 2FA is available now.");
    const { error } = await admin.from("account_security_settings").upsert({ user_id: user.id, mfa_enabled: Boolean(body.mfa_enabled), preferred_channel: channel, updated_at: new Date().toISOString() });
    if (error) throw error;
    return Response.json({ saved: true });
  } catch (error) { return errorResponse(error, "Unable to save security settings."); }
}
