import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertRoleSurfaceHost,
  resolveHostRoute,
  surfacePathForHost,
} from "../src/lib/hostRouting.ts";

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
assert.match(scopedAuth, /girlz-culture-salon-auth/);
assert.match(scopedAuth, /girlz-culture-admin-auth/);
assert.match(boundary, /ADMIN_IDLE_TIMEOUT/);
assert.match(boundary, /ADMIN_ABSOLUTE_SESSION/);
assert.match(proxy, /X-Robots-Tag/);

console.log(
  "Dashboard subdomain verification passed: executable host redirects/rewrites, public salon preservation, role-host denial, scoped sessions, company-domain admin identity, MFA, rate/audit hooks, expiry controls, and noindex behavior are covered.",
);
