import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit } from "@/lib/requestSecurity";
import { activateVerifiedSalonTeamInvitation, assertLoginNotLocked, LoginLockedError, recordLoginAttempt, sessionPayload, signInAndVerifyRole, verifyMfaChallenge, type LoginScope } from "@/lib/secureLoginServer";
import { classifyExpectedSecureLoginFailure } from "@/lib/secureLoginCore";
import { ADMIN_LOGIN_ERROR } from "@/lib/adminSecurityServer";
import { assertRoleSurfaceHost } from "@/lib/hostRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function POSTHandler(request: Request) {
  let requestedRole = "";
  try {
    enforceRateLimit(request, "login-verify", 15, 15 * 60_000);
    const body = await request.json() as Record<string, unknown>;
    const role = cleanText(body.role, 20) as LoginScope;
    requestedRole = role;
    if (!(["customer", "salon", "admin"] as string[]).includes(role)) throw new Error("Invalid login destination.");
    if (role === "admin" || role === "salon") assertRoleSurfaceHost(request, role);
    const { email } = await assertLoginNotLocked(request, role, body.email);
    const code = cleanText(body.code, 6);
    if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit verification code.");
    // Re-verify the account before consuming the one-time challenge. A
    // deployment/provider interruption must not burn a valid code and leave
    // the user unable to retry.
    let auth;
    try {
      auth = await signInAndVerifyRole(email, cleanText(body.password, 200), role);
    } catch (error) {
      await recordLoginAttempt(request, role, email, false);
      throw error;
    }
    await verifyMfaChallenge(
      cleanText(body.challenge_id, 50),
      code,
      role,
      email,
      request,
      auth.user.id,
    );
    await activateVerifiedSalonTeamInvitation(auth.user, role);
    await recordLoginAttempt(request, role, email, true);
    return Response.json({ session: sessionPayload(auth.session) });
  } catch (error) {
    if (error instanceof LoginLockedError) return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter) } });
    const expected = classifyExpectedSecureLoginFailure(error);
    if (expected) {
      const verificationMessage =
        expected.message.startsWith("Verification") ||
        expected.message.startsWith("This verification");
      return Response.json(
        {
          error:
            requestedRole === "admin" && !verificationMessage
              ? ADMIN_LOGIN_ERROR
              : expected.message,
        },
        { status: expected.status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    noteOperationalFailure("Secure login verification failed", error);
    return Response.json(
      { error: "The secure sign-in service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/auth/login/verify", "POST"), POSTHandler);
