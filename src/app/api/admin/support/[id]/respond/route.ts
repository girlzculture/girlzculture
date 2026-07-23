import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { requireAdminPermission, sendEmail } from "@/lib/supabaseAdmin";
import { getEngineList } from "@/lib/engineConfigServer";
import { cleanText } from "@/lib/requestSecurity";

const escapeHtml=(value:string)=>value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, user } = await requireAdminPermission(request, "support");
    const { id } = await context.params;
    const body=await request.json() as { response?: string; status?: string };
    const response=cleanText(body.response,5000);const status=cleanText(body.status||"Resolved",80);
    const statuses=await getEngineList("support.ticket_statuses",["Open","In Progress","Waiting on Customer","Resolved","Closed"],20);
    if (!response) return Response.json({ error: "Write a response before sending." }, { status: 400 });
    if(!statuses.includes(status))return Response.json({error:"Choose an approved support status."},{status:400});
    const { data: ticket, error: readError } = await admin.from("support_tickets").select("*").eq("id", id).single();
    if (readError || !ticket) return Response.json({ error: "Support request not found." }, { status: 404 });
    const patch = { admin_response: response, status, responded_at: new Date().toISOString(), responded_by: user.id, updated_at: new Date().toISOString() };
    const { data, error } = await admin.from("support_tickets").update(patch).eq("id", id).select().single();
    if (error) throw error;
    if (ticket.complaint_id) {
      const { error: complaintError } = await admin.from("complaints_log").update({ status }).eq("id", ticket.complaint_id);
      if (complaintError) throw complaintError;
    }
    if (ticket.requester_email) {
      await sendEmail(ticket.requester_email, `Re: ${ticket.subject}`, `<p>Hello ${escapeHtml(String(ticket.requester_name || "there"))},</p><p>${escapeHtml(response).replaceAll("\n", "<br/>")}</p><p>Girlz Culture Support</p>`, "support");
    }
    console.info("Support response saved", { ticketId: id, adminUserId: user.id });
    return Response.json({ data });
  } catch (error) {
    noteOperationalFailure("Support response failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to send response" }, { status: 500 });
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/support/[id]/respond", "POST"), POSTHandler);
