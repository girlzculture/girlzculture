import "server-only";

import { requireAdmin } from "@/lib/supabaseAdmin";
import { isComplaintSupportTicket } from "@/lib/supportTicketClassification";

type SupportPermission = "support" | "complaints";

/**
 * Resolve support-record authorization from the stored ticket. Request input
 * never chooses the permission boundary, so a support-only administrator
 * cannot open a complaint by changing a URL or request body.
 */
export async function requireAdminSupportRecord(
  request: Request,
  ticketId: string,
) {
  const context = await requireAdmin(request);
  const result = await context.admin
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return { ...context, ticket: null, permission: null };

  const permission: SupportPermission =
    isComplaintSupportTicket(result.data) ? "complaints" : "support";
  const access = context.adminUser as {
    is_super_admin?: boolean;
    permissions?: Record<string, boolean>;
  };
  if (!access.is_super_admin && !access.permissions?.[permission]) {
    throw new Error(
      "Forbidden: this admin role does not have access to this section.",
    );
  }
  return { ...context, ticket: result.data, permission };
}
