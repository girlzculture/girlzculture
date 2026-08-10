export type SupportTicketClassificationRow = {
  complaint_id?: unknown;
  category?: unknown;
};

// Equivalent PostgREST filters for server-side row minimization.
export const complaintSupportTicketFilter =
  "complaint_id.not.is.null,category.ilike.complaint";
export const ordinarySupportTicketFilter =
  "category.is.null,category.not.ilike.complaint";

/**
 * A ticket is a complaint when the retained complaint relationship exists or
 * the stored category explicitly says complaint. Both signals are needed for
 * older records that predate the complaint link and newer linked records whose
 * display category may have changed.
 */
export function isComplaintSupportTicket(
  ticket: SupportTicketClassificationRow,
) {
  return Boolean(ticket.complaint_id)
    || String(ticket.category || "").trim().toLowerCase() === "complaint";
}
