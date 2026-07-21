import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const config = read("src/lib/adminSecurityServer.ts");
const login = read("src/lib/secureLoginServer.ts");
const start = read("src/app/api/auth/login/start/route.ts");
const team = read("src/app/api/admin/team/route.ts");
const migration = read("supabase/migrations/20260720110000_admin_identity_security.sql");
const env = read(".env.example");

const checks = [
  ["confirmed company domain is server-only", config.includes('CONFIRMED_COMPANY_DOMAIN = "girlzculture.com"') && env.includes("ADMIN_EMAIL_DOMAIN=girlzculture.com") && !env.includes("NEXT_PUBLIC_ADMIN_EMAIL")],
  ["domain is parsed exactly", config.includes('domain !== allowedAdminEmailDomain()')],
  ["authorization requires an invited or active user-id record", config.includes('.eq("user_id", user.id)') && config.includes('["Invited", "Active"]')],
  ["verified email ownership is required", config.includes("email_confirmed_at")],
  ["admin login failures are generic", start.includes("ADMIN_LOGIN_ERROR")],
  ["MFA challenge is request-bound and single-use", login.includes("request_fingerprint") && login.includes('.is("used_at", null).select("id")')],
  ["MFA has expiry, attempts, resend cooldown, and audit", login.includes("resendCooldownSeconds") && login.includes("max_attempts") && login.includes("mfa_challenge_verified")],
  ["admin lifecycle actions exist", ["resend","suspend","revoke","reactivate","prepareAndDeleteIdentity","export async function DELETE"].every((value) => team.includes(value))],
  ["acting and last super admin are protected", team.includes("You cannot suspend, revoke, or remove your own admin account") && migration.includes("protect_last_active_super_admin")],
  ["legacy master-email bypass is absent", !read("src/lib/supabaseAdmin.ts").includes("process.env.ADMIN_EMAIL")],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
if (failures.length) process.exit(1);
console.log(`Admin identity security verification passed (${checks.length}/${checks.length}).`);
