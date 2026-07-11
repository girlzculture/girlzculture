import { requireAdmin, sendEmail } from "@/lib/supabaseAdmin";

export async function POST(request: Request, context: RouteContext<"/api/admin/submissions/[id]/decision">) {
  try {
    const { admin, user } = await requireAdmin(request);
    const { id } = await context.params;
    const { decision, reason } = await request.json();
    if (!['approve','reject','activate'].includes(decision)) return Response.json({ error: "Invalid decision" }, { status: 400 });
    const { data: application, error } = await admin.from("salon_applications").select("*").eq("id", id).single();
    if (error || !application) return Response.json({ error: "Application not found" }, { status: 404 });
    const status = decision === "approve" ? "Approved" : decision === "activate" ? "Active" : "Rejected";
    await admin.from("salon_applications").update({ status, rejection_reason: decision === "reject" ? reason : null, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", id);
    await admin.from("salons").update({ status, rejection_reason: decision === "reject" ? reason : null, approved_at: decision === "activate" ? new Date().toISOString() : null }).eq("id", application.salon_id);
    const subject = decision === "activate" ? "Your Girlz Culture store is active" : decision === "approve" ? "Your Girlz Culture application is approved" : "Update on your Girlz Culture application";
    const html = decision === "activate"
      ? `<h1>Your store is active!</h1><p>Log in with your email and password to set up your salon page.</p><p><a href="${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/salon/login">Open your dashboard</a></p>`
      : decision === "approve" ? `<h1>You’re approved!</h1><p>Your application passed review. The Girlz Culture team is now creating and activating your store.</p>` : `<h1>Application update</h1><p>We’re unable to approve your salon at this time.</p><p><strong>Reason:</strong> ${reason || "Please contact support for details."}</p>`;
    await sendEmail(application.business_email, subject, html);
    return Response.json({ ok: true, status });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 403 });
  }
}
