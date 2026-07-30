import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertRoleSurfaceHost,
  resolveHostRoute,
  surfacePathForHost,
} from "../src/lib/hostRouting.ts";
import {
  buildAuthStorageKeys,
  buildLegacyAuthStorageKeys,
  LEGACY_AUTH_STORAGE_KEYS,
} from "../src/lib/authSessionCore.ts";

const config = {
  enabled: true,
  publicHost: "girlzculture.com",
  salonHost: "dashboard.girlzculture.com",
  adminHost: "mothership.girlzculture.com",
};

assert.deepEqual(
  resolveHostRoute("girlzculture.com", "/salon/dashboard/bookings", config),
  {
    kind: "redirect",
    surface: "salon",
    host: "dashboard.girlzculture.com",
    pathname: "/salon/bookings",
    status: 308,
  },
);
assert.deepEqual(
  resolveHostRoute("dashboard.girlzculture.com", "/salon/bookings", config),
  {
    kind: "rewrite",
    surface: "salon",
    pathname: "/salon/dashboard/bookings",
  },
);
assert.deepEqual(
  resolveHostRoute("girlzculture.com", "/admin/finance", config),
  {
    kind: "redirect",
    surface: "admin",
    host: "mothership.girlzculture.com",
    pathname: "/superadmin/finance",
    status: 308,
  },
);
assert.deepEqual(
  resolveHostRoute(
    "mothership.girlzculture.com",
    "/superadmin/finance",
    config,
  ),
  { kind: "rewrite", surface: "admin", pathname: "/admin/finance" },
);
assert.deepEqual(
  resolveHostRoute("girlzculture.com", "/salon/aminata-braids", config),
  { kind: "pass", surface: "public" },
);
assert.equal(
  surfacePathForHost(
    "admin",
    "/admin",
    "mothership.girlzculture.com",
    config,
  ),
  "/superadmin",
);
assert.equal(
  surfacePathForHost(
    "salon",
    "/salon/dashboard",
    "dashboard.girlzculture.com",
    config,
  ),
  "/salon",
);

const request = (host) =>
  new Request("https://girlzculture.com/api/admin/data", {
    headers: { host },
  });
assert.doesNotThrow(() =>
  assertRoleSurfaceHost(request("mothership.girlzculture.com"), "admin", config),
);
assert.throws(
  () => assertRoleSurfaceHost(request("dashboard.girlzculture.com"), "admin", config),
  /Forbidden/,
);
assert.doesNotThrow(() =>
  assertRoleSurfaceHost(request("dashboard.girlzculture.com"), "salon", config),
);

const read = (path) => fs.readFileSync(path, "utf8");
const loginServer = read("src/lib/secureLoginServer.ts");
const adminSecurity = read("src/lib/adminSecurityServer.ts");
const scopedAuth = read("src/lib/supabase.ts");
const boundary = read("src/components/auth/RoleLogoutButton.tsx");
const proxy = read("src/proxy.ts");
for (const control of [
  /assertAuthorizedAdminUser/,
  /requiresMfa/,
  /recordLoginAttempt/,
])
  assert.match(loginServer, control);
assert.match(adminSecurity, /CONFIRMED_COMPANY_DOMAIN = "girlzculture\.com"/);
assert.match(adminSecurity, /ADMIN_MFA_MODE/);
assert.match(scopedAuth, /buildAuthStorageKeys\(supabaseUrl\)/);
const scopedKeys = buildAuthStorageKeys(
  "https://project-reference.supabase.co",
);
assert.notEqual(scopedKeys.salon, scopedKeys.admin);
assert.match(scopedKeys.salon, /v2-project-reference-salon$/);
assert.ok(LEGACY_AUTH_STORAGE_KEYS.salon.includes("girlz-culture-salon-auth"));
assert.ok(LEGACY_AUTH_STORAGE_KEYS.admin.includes("girlz-culture-admin-auth"));
assert.ok(
  buildLegacyAuthStorageKeys("https://project-reference.supabase.co")
    .customer.includes("sb-project-reference-auth-token"),
);
assert.doesNotMatch(
  boundary,
  /ADMIN_IDLE_TIMEOUT|ADMIN_ABSOLUTE_SESSION|expireAdminSession/,
  "Dashboard sessions must not be ended by an idle or absolute client timer.",
);
assert.doesNotMatch(
  boundary,
  /setInterval/,
  "The role session boundary must not run an automatic logout interval.",
);
assert.match(
  boundary,
  /auth\.signOut\(\{ scope: "local" \}\)/,
  "The explicit role-scoped Logout control must remain available.",
);
assert.match(proxy, /X-Robots-Tag/);

console.log(
  "Dashboard subdomain verification passed: executable host redirects/rewrites, public salon preservation, role-host denial, persistent scoped sessions, explicit logout, company-domain admin identity, MFA, rate/audit hooks, and noindex behavior are covered.",
);
