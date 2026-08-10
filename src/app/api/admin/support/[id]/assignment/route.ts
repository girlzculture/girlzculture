import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  isClearlyExpectedMessage,
  isPermissionDenialMessage,
} from "@/lib/operationalMonitoringCore";
import { requireAdminSupportRecord } from "@/lib/adminSupportAccess";
import { cleanText } from "@/lib/requestSecurity";

const priorities = new Set(["Low", "Normal", "High", "Urgent"]);

async function PATCHHandler(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { admin, user, ticket, permission } =
      await requireAdminSupportRecord(request, id);
    if (!ticket) {
      return Response.json(
        { error: "Support request not found." },
        { status: 404 },
      );
    }
    if (!permission) throw new Error("Support queue permission could not be resolved.");
    let body: { assigned_to?: unknown; priority?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json(
        { error: "Enter a valid assignment update." },
        { status: 400 },
      );
    }
    const assignedTo = cleanText(body.assigned_to, 60) || null;
    const priority = cleanText(body.priority, 20) || "Normal";
    if (!priorities.has(priority)) {
      return Response.json(
        { error: "Choose a valid support priority." },
        { status: 400 },
      );
    }
    if (assignedTo && !/^[0-9a-f-]{36}$/i.test(assignedTo)) {
      return Response.json(
        { error: "Choose a valid platform administrator." },
        { status: 400 },
      );
    }
    let assignee: Record<string, unknown> | null = null;
    if (assignedTo) {
      const result = await admin
        .from("admin_users")
        .select("id,user_id,name,email,status,permissions,is_super_admin")
        .or(`user_id.eq.${assignedTo},id.eq.${assignedTo}`)
        .eq("status", "Active")
        .maybeSingle();
      if (result.error) throw result.error;
      assignee = result.data;
      const access = assignee as {
        is_super_admin?: boolean;
        permissions?: Record<string, boolean>;
      } | null;
      if (!access || (!access.is_super_admin && !access.permissions?.[permission])) {
        return Response.json(
          { error: "Choose an active administrator with access to this queue." },
          { status: 400 },
        );
      }
    }
    const result = await admin.rpc("admin_assign_support_ticket", {
      p_ticket_id: id,
      p_actor_user_id: user.id,
      p_assigned_to: assignedTo,
      p_priority: priority,
    });
    if (result.error) throw result.error;
    const mutation = result.data as {
      ticket?: Record<string, unknown>;
    } | null;
    if (!mutation?.ticket) throw new Error("SUPPORT_ASSIGNMENT_EMPTY");
    return Response.json({
      data: mutation.ticket,
      assignee: assignee
        ? {
            id: assignee.id,
            user_id: assignee.user_id,
            name: assignee.name,
            email: assignee.email,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isClearlyExpectedMessage(message) || isPermissionDenialMessage(message)) {
      return Response.json(
        { error: message },
        { status: isPermissionDenialMessage(message) ? 403 : 400 },
      );
    }
    noteOperationalFailure("Support assignment update failed", error);
    throw error;
  }
}

export const PATCH = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/support/[id]/assignment", "PATCH"),
  PATCHHandler,
);
