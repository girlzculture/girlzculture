import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { assertLoginNotLocked, LoginLockedError, recordLoginAttempt, sessionPayload, signInAndVerifyRole, verifyMfaChallenge, type LoginScope } from "@/lib/secureLoginServer";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const role = cleanText(body.role, 20) as LoginScope;
    if (!(["customer", "salon", "admin"] as string[]).includes(role)) throw new Error("Invalid login destination.");
    const { email } = await assertLoginNotLocked(request, role, body.email);
    const code = cleanText(body.code, 6);
    if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit verification code.");
    await verifyMfaChallenge(cleanText(body.challenge_id, 50), code, role, email);
    const auth = await signInAndVerifyRole(email, cleanText(body.password, 200), role);
    await recordLoginAttempt(request, role, email, true);
    return Response.json({ session: sessionPayload(auth.session) });
  } catch (error) {
    if (error instanceof LoginLockedError) return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter) } });
    console.error("Secure login verification failed", error);
    return errorResponse(error, "Unable to verify sign-in.");
  }
}
