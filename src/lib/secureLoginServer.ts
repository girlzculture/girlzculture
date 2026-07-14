import { createClient, type Session, type User } from "@supabase/supabase-js";
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { clientAddress, cleanEmail } from "@/lib/requestSecurity";
import { getSupabaseAdmin, sendEmail, sendSms } from "@/lib/supabaseAdmin";

export type LoginScope = "customer" | "salon" | "admin";
const MAX_FAILURES = 5;
const LOCK_WINDOW_MINUTES = 15;
const CHALLENGE_MINUTES = 10;

function anonAuthClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("Authentication is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function mfaSecret() {
  const value = process.env.MFA_CODE_SECRET || process.env.INTERNAL_API_SECRET;
  if (!value || value.length < 32) throw new Error("MFA_CODE_SECRET must be configured with at least 32 random characters.");
  return value;
}

function hashIp(request: Request) {
  return createHash("sha256").update(`${mfaSecret()}:${clientAddress(request)}`).digest("hex");
}

function hashCode(challengeId: string, code: string) {
  return createHmac("sha256", mfaSecret()).update(`${challengeId}:${code}`).digest("hex");
}

export async function assertLoginNotLocked(request: Request, role: LoginScope, rawEmail: unknown) {
  const email = cleanEmail(rawEmail);
  const admin = getSupabaseAdmin();
  const since = new Date(Date.now() - LOCK_WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await admin.from("auth_login_attempts").select("id", { count: "exact", head: true })
    .eq("role_scope", role).eq("email_normalized", email).eq("succeeded", false).gte("occurred_at", since);
  if (error) throw error;
  if ((count || 0) >= MAX_FAILURES) throw new LoginLockedError(LOCK_WINDOW_MINUTES * 60);
  return { email, ipHash: hashIp(request) };
}

export async function recordLoginAttempt(request: Request, role: LoginScope, email: string, succeeded: boolean) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("auth_login_attempts").insert({ role_scope: role, email_normalized: email, ip_hash: hashIp(request), succeeded });
  if (error) console.error("Unable to record login attempt", { role, error });
}

export async function signInAndVerifyRole(email: string, password: string, expected: LoginScope) {
  const { data, error } = await anonAuthClient().auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) throw new Error("Email or password is incorrect.");
  const actual = await resolveUserRole(data.user);
  if (actual !== expected) throw new Error(`This is not a ${expected === "salon" ? "salon-owner" : expected} account.`);
  return { user: data.user, session: data.session };
}

async function resolveUserRole(user: User): Promise<LoginScope> {
  const admin = getSupabaseAdmin();
  const email = user.email?.trim().toLowerCase() || "";
  const [{ data: adminRows }, { data: salon }, { data: teamMember }] = await Promise.all([
    admin.from("admin_users").select("id,email,status").ilike("email", email),
    admin.from("salons").select("id").eq("user_id", user.id).limit(1).maybeSingle(),
    admin.from("salon_team_members").select("id").eq("user_id", user.id).in("status", ["Invited", "Active"]).limit(1).maybeSingle(),
  ]);
  if ((adminRows || []).some((row) => row.email?.trim().toLowerCase() === email && row.status !== "Inactive")) return "admin";
  if (salon || teamMember) return "salon";
  return "customer";
}

export async function requiresMfa(user: User, role: LoginScope) {
  if (role === "admin" || role === "salon") return true;
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("account_security_settings").select("mfa_enabled").eq("user_id", user.id).maybeSingle();
  return Boolean(data?.mfa_enabled);
}

export async function createMfaChallenge(user: User, role: LoginScope) {
  const admin = getSupabaseAdmin();
  const email = user.email?.trim().toLowerCase() || "";
  const [{ data: security }, { data: salon }, { data: teamMember }, { data: adminUser }] = await Promise.all([
    admin.from("account_security_settings").select("preferred_channel,verified_phone").eq("user_id", user.id).maybeSingle(),
    role === "salon" ? admin.from("salons").select("phone").eq("user_id", user.id).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    role === "salon" ? admin.from("salon_team_members").select("phone").eq("user_id", user.id).in("status", ["Invited", "Active"]).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    role === "admin" ? admin.from("admin_users").select("phone").eq("user_id", user.id).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const requestedChannel = role === "salon" ? "sms" : security?.preferred_channel || "email";
  const phone = String(security?.verified_phone || salon?.phone || teamMember?.phone || adminUser?.phone || user.phone || "");
  const id = randomUUID();
  const code = String(randomInt(100000, 1000000));
  let channel: "email" | "sms" = requestedChannel === "sms" && phone ? "sms" : "email";
  if (channel === "sms") {
    const result = await sendSms(phone, `Your Girlz Culture verification code is ${code}. It expires in ${CHALLENGE_MINUTES} minutes.`) as { skipped?: boolean };
    if (result?.skipped) channel = "email";
  }
  if (channel === "email") {
    const result = await sendEmail(email, "Your Girlz Culture verification code", `<h1>Verify your sign-in</h1><p>Your one-time code is <strong style="font-size:24px;letter-spacing:4px">${code}</strong>.</p><p>It expires in ${CHALLENGE_MINUTES} minutes. If you did not try to sign in, reset your password.</p>`, "security") as { skipped?: boolean };
    if (result?.skipped) throw new Error("Two-factor delivery is not configured. Add RESEND_API_KEY and EMAIL_FROM_SECURITY to the server environment.");
  }
  const { error } = await admin.from("auth_mfa_challenges").insert({ id, user_id: user.id, role_scope: role, email_normalized: email, channel, code_hash: hashCode(id, code), expires_at: new Date(Date.now() + CHALLENGE_MINUTES * 60_000).toISOString() });
  if (error) throw error;
  const destination = channel === "sms" ? phone.replace(/.(?=.{4})/g, "*") : email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2");
  return { challengeId: id, channel, destination };
}

export async function verifyMfaChallenge(challengeId: string, code: string, role: LoginScope, email: string) {
  const admin = getSupabaseAdmin();
  const { data: challenge, error } = await admin.from("auth_mfa_challenges").select("*").eq("id", challengeId).single();
  if (error || !challenge || challenge.role_scope !== role || challenge.email_normalized !== email) throw new Error("Verification request is invalid.");
  if (challenge.used_at) throw new Error("This verification code has already been used.");
  if (new Date(challenge.expires_at).getTime() <= Date.now()) throw new Error("This verification code has expired. Sign in again for a new code.");
  if (Number(challenge.attempts) >= Number(challenge.max_attempts)) throw new LoginLockedError(LOCK_WINDOW_MINUTES * 60);
  const expected = Buffer.from(String(challenge.code_hash), "hex");
  const supplied = Buffer.from(hashCode(challengeId, code), "hex");
  const matches = expected.length === supplied.length && timingSafeEqual(expected, supplied);
  if (!matches) {
    await admin.from("auth_mfa_challenges").update({ attempts: Number(challenge.attempts) + 1 }).eq("id", challengeId);
    throw new Error(`Verification code is incorrect. ${Math.max(0, Number(challenge.max_attempts) - Number(challenge.attempts) - 1)} attempts remain.`);
  }
  await admin.from("auth_mfa_challenges").update({ used_at: new Date().toISOString() }).eq("id", challengeId).is("used_at", null);
}

export function sessionPayload(session: Session) {
  return { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at };
}

export class LoginLockedError extends Error {
  constructor(public retryAfter: number) { super("This sign-in is temporarily locked after repeated failed attempts. Try again in 15 minutes."); }
}
