import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { requireAdmin } from "@/lib/supabaseAdmin";

async function POSTHandler(request: Request) {
  try {
    const { adminUser } = await requireAdmin(request);
    const row = adminUser as { email?: string; role?: string; permissions?: Record<string, boolean>; is_super_admin?: boolean };
    return Response.json({
      isAdmin: true,
      email: row.email || null,
      role: row.role || null,
      permissions: row.permissions && typeof row.permissions === "object" ? row.permissions : {},
      is_super_admin: Boolean(row.is_super_admin),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^Unauthorized$/i.test(message)) {
      noteOperationalFailure("Admin session verification failed", error);
      return Response.json(
        { isAdmin: false, error: "Your session could not be verified." },
        { status: 401 },
      );
    }
    if (/^Forbidden(?::|$)/i.test(message)) {
      return Response.json(
        {
          isAdmin: false,
          error: "You do not have permission to access platform administration.",
        },
        { status: 403 },
      );
    }
    noteOperationalFailure("Admin login verification failed", error);
    return Response.json(
      { isAdmin: false, error: "Admin access could not be verified." },
      { status: 500 },
    );
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/verify", "POST"), POSTHandler);
