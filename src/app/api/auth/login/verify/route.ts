import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { assertLoginNotLocked, LoginLockedError, recordLoginAttempt, sessionPayload, signInAndVerifyRole, verifyMfaChallenge, type LoginScope } from "@/lib/secureLoginServer";
import { ADMIN_LOGIN_ERROR } from "@/lib/adminSecurityServer";

export async function POST(request: Request) {
  let requestedRole = "";
  try {
    enforceRateLimit(request, "login-verify", 15, 15 * 60_000);
    const body = await request.json() as Record<string, unknown>;
    const role = cleanText(body.role, 20) as LoginScope;
    requestedRole = role;
    if (!(["customer", "salon", "admin"] as string[]).includes(role)) throw new Error("Invalid login destination.");
    const { email } = await assertLoginNotLocked(request, role, body.email);
    const code = cleanText(body.code, 6);
    if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit verification code.");
    await verifyMfaChallenge(cleanText(body.challenge_id, 50), code, role, email, request);
    const auth = await signInAndVerifyRole(email, cleanText(body.password, 200), role);
    await recordLoginAttempt(request, role, email, true);
    return Response.json({ session: sessionPayload(auth.session) });
  } catch (error) {
    if (error instanceof LoginLockedError) return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter) } });
    console.error("Secure login verification failed", error);
    if (requestedRole === "admin") return Response.json({ error: ADMIN_LOGIN_ERROR }, { status: 400 });
    return errorResponse(error, "Unable to verify sign-in.");
  }
}
