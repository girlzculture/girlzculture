import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanEmail, cleanText, enforceRateLimit, errorResponse, rejectBot } from "@/lib/requestSecurity";
import { getEngineList } from "@/lib/engineConfigServer";
import { moderatePublicContent } from "@/lib/contentModerationServer";
import { getBusinessSignupContent } from "@/lib/businessSignupContentServer";
import { BusinessWaitlistValidationError, isConfirmedBusinessWaitlistTicketId, validateBusinessWaitlistSubmission } from "@/lib/businessWaitlistCore";

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request,"public-support",5,10*60_000);
    const body = await request.json() as Record<string, unknown>;
    rejectBot(body);
    let fields: { name: string; email: string; subject: string; category: string; message: string };
    if (body.intent === "business_waitlist") {
      const content = await getBusinessSignupContent({ requirePublished: true });
      if (!content) {
        return Response.json({ error: "The business waitlist is temporarily unavailable. Please try again." }, { status: 503 });
      }
      fields = validateBusinessWaitlistSubmission(body, content);
    } else {
      fields = {
        name: cleanText(body.name,120),
        email: cleanEmail(body.email),
        subject: cleanText(body.subject,180),
        category: cleanText(body.category || "General",80),
        message: cleanText(body.message,5000),
      };
    }
    const { name, email, subject, category, message } = fields;
    const categories=await getEngineList("support.ticket_categories",["Bookings","Payments","Account access","Salon concern","Safety","Partnerships","Technical issue","Other"],40);
    if (name.length < 2 || subject.length < 3 || !categories.includes(category) || message.length < 10) {
      return Response.json({ error: "Please complete every field with valid information." }, { status: 400 });
    }
    const admin = getSupabaseAdmin();
    // Support and safety reports are preserved even when they quote harmful
    // language. Flag them for an administrator instead of hiding evidence.
    const moderation = await moderatePublicContent(admin, { name, title: subject, body: message });
    const { data, error } = await admin.from("support_tickets").insert({
      requester_name: name,
      requester_email: email,
      subject,
      category,
      message,
      status: "Open",
      priority: category === "Safety" || !moderation.allowed ? "High" : "Normal",
      content_moderation_status: moderation.allowed ? "Clear" : "Flagged",
      content_moderation_reason: moderation.reason || null,
      content_moderation_source: moderation.source,
    }).select("id").single();
    if (error) throw error;
    if (body.intent === "business_waitlist" && !isConfirmedBusinessWaitlistTicketId(data?.id)) {
      throw new Error("Business waitlist persistence returned no confirmed ticket reference.");
    }
    console.info("Public support request created", { ticketId: data.id, category });
    return Response.json({ ok: true, ticketId: data.id });
  } catch (error) {
    if (error instanceof BusinessWaitlistValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    noteOperationalFailure("Public support request failed", error);
    return errorResponse(error,"Unable to submit your request");
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/support", "POST"),
  POSTHandler,
);
