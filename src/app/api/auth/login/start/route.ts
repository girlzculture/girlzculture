import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit, errorResponse, rejectBot } from "@/lib/requestSecurity";
import { assertLoginNotLocked, createMfaChallenge, LoginLockedError, MfaCooldownError, recordLoginAttempt, requiresMfa, sessionPayload, signInAndVerifyRole, type LoginScope } from "@/lib/secureLoginServer";
import { ADMIN_LOGIN_ERROR, assertCompanyAdminEmail } from "@/lib/adminSecurityServer";

async function POSTHandler(request: Request) {
  let requestedRole = "";
  try {
    enforceRateLimit(request, "login-start", 10, 15 * 60_000);
    const body = await request.json() as Record<string, unknown>;
    rejectBot(body);
    const role = cleanText(body.role, 20) as LoginScope;
    requestedRole = role;
    if (!(["customer", "salon", "admin"] as string[]).includes(role)) throw new Error("Invalid login destination.");
    if (role === "admin") assertCompanyAdminEmail(body.email);
    const { email } = await assertLoginNotLocked(request, role, body.email);
    const password = cleanText(body.password, 200);
    if (!password) throw new Error("Password is required.");
    let auth;
    try { auth = await signInAndVerifyRole(email, password, role); }
    catch (error) { await recordLoginAttempt(request, role, email, false); throw error; }
    await recordLoginAttempt(request, role, email, true);
    if (!(await requiresMfa(auth.user, role))) return Response.json({ requires_mfa: false, session: sessionPayload(auth.session) });
    const challenge = await createMfaChallenge(auth.user, role, request);
    return Response.json({ requires_mfa: true, challenge_id: challenge.challengeId, channel: challenge.channel, destination: challenge.destination });
  } catch (error) {
    if (error instanceof LoginLockedError) return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter) } });
    if (error instanceof MfaCooldownError) return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter) } });
    noteOperationalFailure("Secure login start failed", error);
    if (requestedRole === "admin") return Response.json({ error: ADMIN_LOGIN_ERROR }, { status: 400 });
    return errorResponse(error, "Unable to sign in.");
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/auth/login/start", "POST"), POSTHandler);
