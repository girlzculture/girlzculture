import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const migration = read("supabase/migrations/20260720100000_canonical_identity.sql");
const customer = read("src/components/CustomerAuth.tsx");
const salon = read("src/components/SalonSignup.tsx");
const invite = read("src/lib/teamInvite.ts");
const destination = read("src/app/api/auth/destination/route.ts");
const application = read("src/app/api/salon/application/route.ts");

const checks = [
  ["canonical email is unique", /email_normalized text not null unique/.test(migration)],
  ["normalization is immutable", /normalize_identity_email[\s\S]*?immutable/.test(migration)],
  ["auth changes create canonical identities", /sync_platform_identity_after_auth_change/.test(migration)],
  ["historical conflicts are inventoried", /identity_conflict_queue/.test(migration)],
  ["role tables enforce canonical ownership", /assert_primary_identity/.test(migration) && /enforce_salon_team_identity/.test(migration)],
  ["customer signup uses server identity endpoint", customer.includes('fetch("/api/auth/signup"') && !customer.includes("auth.signUp")],
  ["salon signup uses server identity endpoint", salon.includes('fetch("/api/auth/signup"') && !salon.includes("auth.signUp")],
  ["team invitation cannot reuse Auth users", invite.includes("assertEmailAvailableForNewIdentity") && !invite.includes("listUsers") && !invite.includes("return { user: found")],
  ["role destination uses canonical identity", destination.includes("canonicalIdentityForUser") && destination.includes('.eq("user_id", user.id)')],
  ["salon application email is bound to Auth", application.includes("businessEmail !== accountEmail")],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
console.log(`Canonical identity verification passed (${checks.length}/${checks.length}).`);
