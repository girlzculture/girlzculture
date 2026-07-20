import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cleanEmail } from "@/lib/requestSecurity";

const CONFIRMED_COMPANY_DOMAIN = "girlzculture.com";
export const ADMIN_LOGIN_ERROR = "Unable to sign in with that admin account.";

export function allowedAdminEmailDomain() {
  const configured = String(process.env.ADMIN_EMAIL_DOMAIN || CONFIRMED_COMPANY_DOMAIN)
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(configured)) {
    throw new Error("ADMIN_EMAIL_DOMAIN is invalid.");
  }
  return configured;
}

export function assertCompanyAdminEmail(value: unknown) {
  const email = cleanEmail(value);
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || domain !== allowedAdminEmailDomain()) throw new Error(ADMIN_LOGIN_ERROR);
  return email;
}

export async function assertAuthorizedAdminUser(admin: SupabaseClient, user: User) {
  const email = assertCompanyAdminEmail(user.email);
  if (!user.email_confirmed_at) throw new Error(ADMIN_LOGIN_ERROR);
  const { data: record, error } = await admin
    .from("admin_users")
    .select("id,user_id,email,role,status,permissions,is_super_admin,activated_at")
    .eq("user_id", user.id)
    .in("status", ["Invited", "Active"])
    .limit(1)
    .maybeSingle();
  if (error || !record || cleanEmail(record.email) !== email) throw new Error(ADMIN_LOGIN_ERROR);
  const permissions = record.permissions && typeof record.permissions === "object"
    ? record.permissions as Record<string, unknown>
    : {};
  if (!record.is_super_admin && !Object.values(permissions).some(Boolean)) throw new Error(ADMIN_LOGIN_ERROR);
  return record;
}

function integerSetting(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

export function adminMfaPolicy() {
  const mode = process.env.ADMIN_MFA_MODE || "every_login";
  if (mode !== "every_login") throw new Error("ADMIN_MFA_MODE must be every_login until trusted-device enrollment is enabled.");
  return {
    mode: "every_login" as const,
    challengeMinutes: integerSetting("MFA_CHALLENGE_TTL_MINUTES", 10, 5, 15),
    maxAttempts: integerSetting("MFA_MAX_ATTEMPTS", 5, 3, 10),
    resendCooldownSeconds: integerSetting("MFA_RESEND_COOLDOWN_SECONDS", 60, 30, 300),
  };
}
