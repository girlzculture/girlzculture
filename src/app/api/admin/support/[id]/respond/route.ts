import { requireAdmin, sendEmail } from "@/lib/supabaseAdmin";

export async function POST(request: Request, context: RouteContext<"/api/admin/support/[id]/respond">) {
  try {
    const { admin, user } = await requireAdmin(request);
    const { id } = await context.params;
    const { response, status = "Resolved" } = await request.json() as { response?: string; status?: string };
    if (!response?.trim()) return Response.json({ error: "Write a response before sending." }, { status: 400 });
    const { data: ticket, error: readError } = await admin.from("support_tickets").select("*").eq("id", id).single();
    if (readError || !ticket) return Response.json({ error: "Support request not found." }, { status: 404 });
    const patch = { admin_response: response.trim(), status, responded_at: new Date().toISOString(), responded_by: user.id, updated_at: new Date().toISOString() };
    const { data, error } = await admin.from("support_tickets").update(patch).eq("id", id).select().single();
    if (error) throw error;
    if (ticket.requester_email) {
      await sendEmail(ticket.requester_email, `Re: ${ticket.subject}`, `<p>Hello ${ticket.requester_name || "there"},</p><p>${response.trim().replaceAll("\n", "<br/>")}</p><p>Girlz Culture Support</p>`);
    }
    console.info("Support response saved", { ticketId: id, admin: user.email });
    return Response.json({ data });
  } catch (error) {
    console.error("Support response failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to send response" }, { status: 500 });
  }
}
