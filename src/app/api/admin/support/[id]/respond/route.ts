import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { sendEmail } from "@/lib/supabaseAdmin";
import { getEngineList } from "@/lib/engineConfigServer";
import { cleanText } from "@/lib/requestSecurity";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireAdminSupportRecord } from "@/lib/adminSupportAccess";
import type { SupabaseClient } from "@supabase/supabase-js";

const escapeHtml=(value:string)=>value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const deliveryErrorCode=(error:unknown)=>{
  const message=error instanceof Error?error.message:"";
  const known=message.match(/EMAIL_DELIVERY_FAILED_\d{3}/)?.[0];
  return known||(/NOT_CONFIGURED/.test(message)?"EMAIL_PROVIDER_NOT_CONFIGURED":"SUPPORT_EMAIL_DELIVERY_FAILED");
};

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  let monitoringAdmin: SupabaseClient | undefined;
  let recordId = "";
  try {
    const { id } = await context.params;
    recordId = id;
    const { admin, user, ticket, permission } = await requireAdminSupportRecord(request, id);
    monitoringAdmin = admin;
    if (!ticket) return Response.json({ error: "Support request not found." }, { status: 404 });
    let body: { response?: string; status?: string; idempotency_key?: string };
    try { body = await request.json() as { response?: string; status?: string; idempotency_key?: string }; }
    catch { return Response.json({ error: "Enter a valid support response." }, { status: 400, headers: { "Cache-Control": "private, no-store" } }); }
    const response=cleanText(body.response,5000);const status=cleanText(body.status||"Resolved",80);
    const statuses=await getEngineList("support.ticket_statuses",["Open","In Progress","Waiting on Customer","Resolved","Closed"],20);
    if (!response) return Response.json({ error: "Write a response before sending." }, { status: 400 });
    if(!statuses.includes(status))return Response.json({error:"Choose an approved support status."},{status:400});
    const idempotencyKey=cleanText(body.idempotency_key,160)||crypto.randomUUID();
    const mutation=await admin.rpc("admin_respond_support_ticket",{
      p_ticket_id:id,
      p_actor_user_id:user.id,
      p_response:response,
      p_status:status,
      p_idempotency_key:idempotencyKey,
    });
    if(mutation.error)throw mutation.error;
    const result=mutation.data as {ticket?:Record<string,unknown>;outbox?:Record<string,unknown>;replayed?:boolean}|null;
    if(!result?.ticket)throw new Error("SUPPORT_RESPONSE_EMPTY");
    let emailDelivery=String(result.outbox?.delivery_status||"NotRequired");
    if(result.outbox?.id&&["Pending","Failed"].includes(emailDelivery)){
      const claim=await admin.rpc("admin_claim_support_response_email",{
        p_outbox_id:result.outbox.id,
        p_actor_user_id:user.id,
      });
      if(claim.error){
        noteOperationalFailure("Support response email claim failed",{code:claim.error.code,provider:"supabase",outboxId:result.outbox.id});
        emailDelivery="Pending";
      }else if(claim.data){
        const deliveryRow=claim.data as Record<string,unknown>;
        try{
          const delivery=await sendEmail(
            String(deliveryRow.recipient_email||""),
            String(deliveryRow.subject||"Girlz Culture Support"),
            `<p>Hello ${escapeHtml(String(deliveryRow.recipient_name||"there"))},</p><p>${escapeHtml(String(deliveryRow.response_text||"")).replaceAll("\n","<br/>")}</p><p>Girlz Culture Support</p>`,
            "support",
            {idempotencyKey:String(deliveryRow.idempotency_key||idempotencyKey)},
          ) as {id?:unknown;skipped?:boolean};
          if(delivery.skipped)throw Object.assign(new Error("EMAIL_PROVIDER_NOT_CONFIGURED"),{provider:"resend"});
          const completed=await admin.rpc("admin_complete_support_response_email",{
            p_outbox_id:deliveryRow.id,
            p_actor_user_id:user.id,
            p_delivery_status:"Sent",
            p_provider_message_id:String(delivery.id||"")||null,
            p_error_code:null,
          });
          if(completed.error){
            noteOperationalFailure("Support response email receipt persistence failed",{code:completed.error.code,provider:"supabase",outboxId:deliveryRow.id});
            emailDelivery="Processing";
          }else emailDelivery="Sent";
        }catch(deliveryError){
          const code=deliveryErrorCode(deliveryError);
          const failed=await admin.rpc("admin_complete_support_response_email",{
            p_outbox_id:deliveryRow.id,
            p_actor_user_id:user.id,
            p_delivery_status:"Failed",
            p_provider_message_id:null,
            p_error_code:code,
          });
          if(failed.error)noteOperationalFailure("Support response email failure persistence failed",{code:failed.error.code,provider:"supabase",outboxId:deliveryRow.id});
          noteOperationalFailure("Support response email delivery failed",{code,provider:"resend",outboxId:deliveryRow.id});
          emailDelivery="Failed";
        }
      }
    }
    console.info("Support response saved", { ticketId: id, adminUserId: user.id, permission });
    return Response.json({ data:result.ticket,email_delivery:emailDelivery,replayed:result.replayed===true });
  } catch (error) {
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "admin-support", action: "respond", actorRole: "admin", recordType: "support_ticket", recordId: recordId || null, safeMessage: "We couldn't save this support response." });
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/support/[id]/respond", "POST"), POSTHandler);
