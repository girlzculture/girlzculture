import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";
import { DASHBOARD_SURFACE_HEADER, RENDER_PATH_HEADER, dashboardSurfaceFromHeader, usesManagedLocalization } from "../../src/lib/publicTranslation";

test("public route policy distinguishes salon profiles and business onboarding from internal locales", () => {
  for (const path of ["/", "/businesses", "/business/signup", "/business/login", "/business/apply", "/salons", "/styles", "/login", "/help", "/salon/acceptance-salon", "/salon/acceptance-salon/book", "/accounting", "/administrator", "/salon/dashboard-design"]) {
    expect(usesManagedLocalization(path), path).toBe(false);
  }
  for (const path of ["/admin", "/admin/login", "/admin/translations", "/superadmin", "/superadmin/engine", "/salon/dashboard", "/salon/dashboard/bookings", "/account"]) {
    expect(usesManagedLocalization(path), path).toBe(true);
  }
  expect(usesManagedLocalization("/salon/bookings", "salon")).toBe(true);
  expect(usesManagedLocalization("/superadmin/engine", "admin")).toBe(true);
  expect(dashboardSurfaceFromHeader("invented")).toBe("public");
});

test("proxy overwrites spoofed localization headers and retains deferred host rewrite and robots behavior", () => {
  const previous = { enabled: process.env.DASHBOARD_SUBDOMAINS_ENABLED, ready: process.env.DASHBOARD_SUBDOMAINS_PILOT_READY };
  try {
    process.env.DASHBOARD_SUBDOMAINS_ENABLED = "false";
    const response = proxy(new NextRequest("https://girlzculture.com/business/signup", { headers: {
      host: "girlzculture.com", [RENDER_PATH_HEADER]: "/admin", [DASHBOARD_SURFACE_HEADER]: "admin",
    } }));
    expect(response.headers.get(`x-middleware-request-${RENDER_PATH_HEADER}`)).toBe("/business/signup");
    expect(response.headers.get(`x-middleware-request-${DASHBOARD_SURFACE_HEADER}`)).toBe("public");
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-robots-tag")).toBeNull();

    process.env.DASHBOARD_SUBDOMAINS_ENABLED = "true";
    process.env.DASHBOARD_SUBDOMAINS_PILOT_READY = "true";
    const rewrite = proxy(new NextRequest("https://mothership.girlzculture.com/superadmin/engine", { headers: { host: "mothership.girlzculture.com" } }));
    expect(rewrite.headers.get("x-middleware-rewrite")).toBe("https://mothership.girlzculture.com/admin/engine");
    expect(rewrite.headers.get(`x-middleware-request-${RENDER_PATH_HEADER}`)).toBe("/admin/engine");
    expect(rewrite.headers.get(`x-middleware-request-${DASHBOARD_SURFACE_HEADER}`)).toBe("admin");
    expect(rewrite.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    const redirect = proxy(new NextRequest("https://girlzculture.com/admin/engine", { headers: { host: "girlzculture.com" } }));
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe("https://mothership.girlzculture.com/superadmin/engine");
  } finally {
    if (previous.enabled === undefined) delete process.env.DASHBOARD_SUBDOMAINS_ENABLED;
    else process.env.DASHBOARD_SUBDOMAINS_ENABLED = previous.enabled;
    if (previous.ready === undefined) delete process.env.DASHBOARD_SUBDOMAINS_PILOT_READY;
    else process.env.DASHBOARD_SUBDOMAINS_PILOT_READY = previous.ready;
  }
});
