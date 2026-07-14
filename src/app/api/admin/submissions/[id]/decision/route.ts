import { normalizePlan } from "@/lib/plans";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireAdmin, sendEmail } from "@/lib/supabaseAdmin";

export async function POST(request: Request, context: RouteContext<"/api/admin/submissions/[id]/decision">) {
  try {
    enforceRateLimit(request,"admin-submission-decision",30,60_000);
    const {admin,user}=await requireAdmin(request);
    const {id}=await context.params;
    const body=await request.json() as Record<string,unknown>;
    const decision=cleanText(body.decision,20);
    if(!["approve","reject","activate"].includes(decision))return Response.json({error:"Invalid decision"},{status:400});
    const {data:application,error}=await admin.from("salon_applications").select("*").eq("id",id).single();
    if(error||!application)return Response.json({error:"Application not found"},{status:404});
    const status=decision==="approve"?"Approved":decision==="activate"?"Active":"Rejected";
    const safeReason=cleanText(body.reason,1000)||null;
    const plan=normalizePlan(application.selected_plan);
    const reviewedAt=new Date().toISOString();
    const {error:applicationError}=await admin.from("salon_applications").update({status,rejection_reason:decision==="reject"?safeReason:null,reviewed_by:user.id,reviewed_at:reviewedAt}).eq("id",id);
    if(applicationError)throw applicationError;
    const {error:salonError}=await admin.from("salons").update({status,subscription_tier:plan,subscription_status:"inactive",logo_url:application.logo_url||null,rejection_reason:decision==="reject"?safeReason:null,approved_at:decision==="activate"?reviewedAt:null}).eq("id",application.salon_id);
    if(salonError)throw salonError;
    const base=process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000";
    const subject=decision==="activate"?"Your Girlz Culture store is active":decision==="approve"?"Your Girlz Culture application is approved":"Update on your Girlz Culture application";
    const html=decision==="activate"
      ? `<h1>Your store is active!</h1><p>Log in to activate your ${plan} subscription in Stripe test mode. The rest of the dashboard unlocks as soon as the test subscription succeeds.</p><p><a href="${base}/salon/login">Open your dashboard</a></p>`
      : decision==="approve"?"<h1>You’re approved!</h1><p>Your application passed review. The Girlz Culture team is now preparing your store for activation.</p>"
      : `<h1>Application update</h1><p>We’re unable to approve your salon at this time.</p><p><strong>Reason:</strong> ${safeReason||"Please contact support for details."}</p>`;
    await sendEmail(application.business_email,subject,html);
    return Response.json({ok:true,status,plan});
  }catch(error){console.error("Application decision failed",error);return errorResponse(error,"Request failed");}
}
