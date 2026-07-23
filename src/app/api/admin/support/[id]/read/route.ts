import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

async function PATCHHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, user } = await requireAdminPermission(request, "support");
    const { id } = await context.params;
    const { data: existing, error: readError } = await admin
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (readError) throw readError;
    if (!existing) return Response.json({ error: "Support request not found." }, { status: 404 });
    if (existing.admin_read_at) return Response.json({ data: existing });

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("support_tickets")
      .update({ admin_read_at: now, admin_read_by: user.id, updated_at: now })
      .eq("id", id)
      .is("admin_read_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw error;

    console.info("Admin support request marked read", { ticketId: id, adminUserId: user.id });
    return Response.json({ data: data || existing });
  } catch (error) {
    noteOperationalFailure("Admin support read update failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to mark request as read" }, { status: 500 });
  }
}
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/admin/support/[id]/read", "PATCH"), PATCHHandler);
