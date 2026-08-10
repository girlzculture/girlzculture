import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireAdminSupportRecord } from "@/lib/adminSupportAccess";
import type { SupabaseClient } from "@supabase/supabase-js";

async function PATCHHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  let monitoringAdmin: SupabaseClient | undefined;
  let recordId = "";
  try {
    const { id } = await context.params;
    recordId = id;
    const { admin, user, ticket: existing, permission } = await requireAdminSupportRecord(request, id);
    monitoringAdmin = admin;
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

    console.info("Admin support request marked read", { ticketId: id, adminUserId: user.id, permission });
    return Response.json({
      data: data || { ...existing, admin_read_at: now, admin_read_by: user.id },
    });
  } catch (error) {
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "admin-support", action: "mark-read", actorRole: "admin", recordType: "support_ticket", recordId: recordId || null, safeMessage: "We couldn't update this support request." });
  }
}
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/admin/support/[id]/read", "PATCH"), PATCHHandler);
