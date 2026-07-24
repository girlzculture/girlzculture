export type DashboardSurface = "public" | "salon" | "admin";
export type HostRouteDecision =
  | { kind: "pass"; surface: DashboardSurface }
  | { kind: "redirect"; surface: DashboardSurface; host: string; pathname: string; status: 308 }
  | { kind: "rewrite"; surface: DashboardSurface; pathname: string };

export type HostRoutingConfig = {
  enabled: boolean;
  publicHost: string;
  salonHost: string;
  adminHost: string;
};

export function normalizeRequestHost(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

export function hostRoutingConfig(): HostRoutingConfig {
  return {
    enabled: process.env.DASHBOARD_SUBDOMAINS_ENABLED === "true",
    publicHost: normalizeRequestHost(
      process.env.NEXT_PUBLIC_SITE_HOST || "girlzculture.com",
    ),
    salonHost: normalizeRequestHost(
      process.env.NEXT_PUBLIC_SALON_DASHBOARD_HOST ||
        "dashboard.girlzculture.com",
    ),
    adminHost: normalizeRequestHost(
      process.env.NEXT_PUBLIC_ADMIN_HOST || "mothership.girlzculture.com",
    ),
  };
}

function starts(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function suffix(pathname: string, prefix: string) {
  const value = pathname.slice(prefix.length);
  return value.startsWith("/") ? value : value ? `/${value}` : "";
}

export function resolveHostRoute(
  host: string,
  pathname: string,
  config: HostRoutingConfig,
): HostRouteDecision {
  const normalizedHost = normalizeRequestHost(host);
  if (!config.enabled || !normalizedHost)
    return { kind: "pass", surface: "public" };

  if (normalizedHost === config.salonHost) {
    if (pathname === "/")
      return { kind: "redirect", surface: "salon", host: config.salonHost, pathname: "/salon", status: 308 };
    if (starts(pathname, "/api") || starts(pathname, "/_next"))
      return { kind: "pass", surface: "salon" };
    if (starts(pathname, "/salon/dashboard"))
      return {
        kind: "redirect",
        surface: "salon",
        host: config.salonHost,
        pathname: `/salon${suffix(pathname, "/salon/dashboard")}`,
        status: 308,
      };
    if (pathname === "/login")
      return { kind: "rewrite", surface: "salon", pathname: "/salon/login" };
    if (pathname === "/signup")
      return { kind: "rewrite", surface: "salon", pathname: "/salon/signup" };
    if (starts(pathname, "/salon"))
      return {
        kind: "rewrite",
        surface: "salon",
        pathname: `/salon/dashboard${suffix(pathname, "/salon")}`,
      };
    return { kind: "redirect", surface: "salon", host: config.salonHost, pathname: "/salon", status: 308 };
  }

  if (normalizedHost === config.adminHost) {
    if (pathname === "/")
      return { kind: "redirect", surface: "admin", host: config.adminHost, pathname: "/superadmin", status: 308 };
    if (starts(pathname, "/api") || starts(pathname, "/_next"))
      return { kind: "pass", surface: "admin" };
    if (starts(pathname, "/admin"))
      return {
        kind: "redirect",
        surface: "admin",
        host: config.adminHost,
        pathname: `/superadmin${suffix(pathname, "/admin")}`,
        status: 308,
      };
    if (starts(pathname, "/superadmin"))
      return {
        kind: "rewrite",
        surface: "admin",
        pathname: `/admin${suffix(pathname, "/superadmin")}`,
      };
    return { kind: "redirect", surface: "admin", host: config.adminHost, pathname: "/superadmin", status: 308 };
  }

  if (starts(pathname, "/admin")) {
    return {
      kind: "redirect",
      surface: "admin",
      host: config.adminHost,
      pathname: `/superadmin${suffix(pathname, "/admin")}`,
      status: 308,
    };
  }
  if (starts(pathname, "/salon/dashboard")) {
    return {
      kind: "redirect",
      surface: "salon",
      host: config.salonHost,
      pathname: `/salon${suffix(pathname, "/salon/dashboard")}`,
      status: 308,
    };
  }
  if (pathname === "/salon/login") {
    return { kind: "redirect", surface: "salon", host: config.salonHost, pathname: "/login", status: 308 };
  }
  return { kind: "pass", surface: "public" };
}

export function surfacePathForHost(
  scope: "salon" | "admin",
  internalPath: string,
  host: string,
  config = hostRoutingConfig(),
) {
  const normalizedHost = normalizeRequestHost(host);
  if (!config.enabled) return internalPath;
  if (scope === "admin" && normalizedHost === config.adminHost) {
    return starts(internalPath, "/admin")
      ? `/superadmin${suffix(internalPath, "/admin")}`
      : "/superadmin";
  }
  if (scope === "salon" && normalizedHost === config.salonHost) {
    if (internalPath === "/salon/login") return "/login";
    return starts(internalPath, "/salon/dashboard")
      ? `/salon${suffix(internalPath, "/salon/dashboard")}`
      : "/salon";
  }
  return internalPath;
}

export function assertRoleSurfaceHost(
  request: Request,
  scope: "salon" | "admin",
  config = hostRoutingConfig(),
) {
  if (!config.enabled) return;
  const host = normalizeRequestHost(
    request.headers.get("x-forwarded-host") || request.headers.get("host"),
  );
  const expected = scope === "admin" ? config.adminHost : config.salonHost;
  if (host !== expected) throw new Error("Forbidden: use the authorized account portal.");
}
