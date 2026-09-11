import type { DashboardSurface } from "./hostRouting";

// Overwritten by proxy after host routing; client-supplied values are never used.
export const RENDER_PATH_HEADER = "x-gc-render-path";
export const DASHBOARD_SURFACE_HEADER = "x-gc-dashboard-surface";

export function usesManagedLocalization(
  pathname: string,
  dashboardSurface: DashboardSurface = "public",
) {
  if (dashboardSurface === "admin" || dashboardSurface === "salon") return true;
  return ["/admin", "/superadmin", "/account", "/salon/dashboard"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function dashboardSurfaceFromHeader(value: string | null): DashboardSurface {
  return value === "admin" || value === "salon" ? value : "public";
}
