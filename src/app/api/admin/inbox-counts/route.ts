import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { requireAdmin } from "@/lib/supabaseAdmin";

async function GETHandler(request: Request) {
  try {
    const { admin, adminUser } = await requireAdmin(request);
    const access = adminUser as { is_super_admin?: boolean; permissions?: Record<string, boolean> };
    if (!access.is_super_admin && !access.permissions?.support) {
      return Response.json({ support: 0, complaints: 0 });
    }

    const { data, error } = await admin
      .from("support_tickets")
      .select("category")
      .is("admin_read_at", null)
      .limit(1000);
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const complaints = rows.filter((ticket) => String(ticket.category || "").toLowerCase() === "complaint").length;
    return Response.json({ support: rows.length - complaints, complaints });
  } catch (error) {
    noteOperationalFailure("Admin inbox counts failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load inbox counts" }, { status: 403 });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/inbox-counts", "GET"), GETHandler);
