import { requireAdmin, sendEmail } from "@/lib/supabaseAdmin";

export async function POST(request: Request, context: RouteContext<"/api/admin/submissions/[id]/decision">) {
  try {
    const { admin, user } = await requireAdmin(request);
    const { id } = await context.params;
    const { decision, reason } = await request.json();
    if (!['approve','reject'].includes(decision)) return Response.json({ error: "Invalid decision" }, { status: 400 });
    const { data: application, error } = await admin.from("salon_applications").select("*").eq("id", id).single();
    if (error || !application) return Response.json({ error: "Application not found" }, { status: 404 });
    const active = decision === "approve";
    await admin.from("salon_applications").update({ status: active ? "Active" : "Rejected", rejection_reason: active ? null : reason, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", id);
    await admin.from("salons").update({ status: active ? "Active" : "Rejected", rejection_reason: active ? null : reason, approved_at: active ? new Date().toISOString() : null }).eq("id", application.salon_id);
    const subject = active ? "Your Girlz Culture salon is approved" : "Update on your Girlz Culture application";
    const html = active
      ? `<h1>You’re approved!</h1><p>Your store is active. Log in with your email and password to set up your salon page.</p><p><a href="${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/salon/login">Open your dashboard</a></p>`
      : `<h1>Application update</h1><p>We’re unable to approve your salon at this time.</p><p><strong>Reason:</strong> ${reason || "Please contact support for details."}</p>`;
    await sendEmail(application.business_email, subject, html);
    return Response.json({ ok: true, status: active ? "Active" : "Rejected" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 403 });
  }
}
