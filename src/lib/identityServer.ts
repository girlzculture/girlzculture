import "server-only";

import { createHmac } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { clientAddress } from "@/lib/requestSecurity";
import { normalizeEmail } from "@/lib/validation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type PrimaryIdentityRole = "customer" | "salon_owner" | "salon_team" | "admin";
export const IDENTITY_UNAVAILABLE_MESSAGE =
  "This email cannot be used for a new account. Sign in or recover your account.";

export class IdentityUnavailableError extends Error {
  constructor() {
    super(IDENTITY_UNAVAILABLE_MESSAGE);
  }
}

function auditSecret() {
  const secret = process.env.MFA_CODE_SECRET || process.env.INTERNAL_API_SECRET;
  if (!secret || secret.length < 32) throw new Error("Identity audit signing is not configured.");
  return secret;
}

function protectedHash(value: string) {
  return createHmac("sha256", auditSecret()).update(value).digest("hex");
}

async function authUserForEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 10; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    const user = result.data.users.find(
      (candidate) => normalizeEmail(candidate.email) === email,
    );
    if (user) return user;
    if (result.data.users.length < 1000) return null;
  }
  throw new Error("Identity lookup exceeded its safe pagination limit.");
}

export async function auditIdentityEvent({
  request,
  eventType,
  email,
  role,
  source,
  actorUserId,
  details,
}: {
  request?: Request;
  eventType: string;
  email?: string;
  role?: PrimaryIdentityRole;
  source: string;
  actorUserId?: string | null;
  details?: Record<string, unknown>;
}) {
  const admin = getSupabaseAdmin();
  const normalized = email ? normalizeEmail(email) : "";
  const { error } = await admin.from("identity_security_events").insert({
    event_type: eventType,
    attempted_role: role || null,
    source,
    email_hash: normalized ? protectedHash(normalized) : null,
    actor_user_id: actorUserId || null,
    request_fingerprint: request ? protectedHash(clientAddress(request)) : null,
    details: details || {},
  });
  if (error) console.error("Identity security event could not be recorded", { eventType, source, code: error.code });
}

export async function assertEmailAvailableForNewIdentity(
  emailInput: unknown,
  role: PrimaryIdentityRole,
  source: string,
  request?: Request,
  actorUserId?: string | null,
) {
  const email = normalizeEmail(emailInput);
  const admin = getSupabaseAdmin();
  const [{ data: identity, error: identityError }, authUser] = await Promise.all([
    admin
      .from("platform_identities")
      .select("user_id")
      .eq("email_normalized", email)
      .maybeSingle(),
    authUserForEmail(admin, email),
  ]);
  if (identityError && identityError.code !== "PGRST205") throw identityError;
  if (identity || authUser) {
    await auditIdentityEvent({
      request,
      eventType: "cross_role_identity_blocked",
      email,
      role,
      source,
      actorUserId,
    });
    throw new IdentityUnavailableError();
  }
  return email;
}

export async function canonicalIdentityForUser(userId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("platform_identities")
    .select("user_id,email_normalized,primary_role,status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error && error.code !== "PGRST205") throw error;
  return data as
    | { user_id: string; email_normalized: string; primary_role: PrimaryIdentityRole; status: string }
    | null;
}

export function identityRoleToLoginScope(role: PrimaryIdentityRole) {
  if (role === "admin") return "admin" as const;
  if (role === "salon_owner" || role === "salon_team") return "salon" as const;
  return "customer" as const;
}

