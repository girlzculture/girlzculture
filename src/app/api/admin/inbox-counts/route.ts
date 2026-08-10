import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { requireAdmin } from "@/lib/supabaseAdmin";
import { isComplaintSupportTicket } from "@/lib/supportTicketClassification";

async function GETHandler(request: Request) {
  const { admin, adminUser } = await requireAdmin(request);
  const access = adminUser as { is_super_admin?: boolean; permissions?: Record<string, boolean> };
  const canReadSupport = Boolean(access.is_super_admin || access.permissions?.support);
  const canReadComplaints = Boolean(access.is_super_admin || access.permissions?.complaints);
  if (!canReadSupport && !canReadComplaints) {
    return Response.json({ support: 0, complaints: 0 });
  }

  const { data, error } = await admin
    .from("support_tickets")
    .select("category,complaint_id")
    .is("admin_read_at", null)
    .limit(1000);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const complaints = rows.filter(isComplaintSupportTicket).length;
  return Response.json({
    support: canReadSupport ? rows.length - complaints : 0,
    complaints: canReadComplaints ? complaints : 0,
  });
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/inbox-counts", "GET"), GETHandler);
