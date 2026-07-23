import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { capturePlatformError } from "@/lib/platformErrors";
import { createHash } from "node:crypto";
import { clientAddress, cleanEmail, cleanText, enforceRateLimit, errorResponse, RateLimitError, rejectBot } from "@/lib/requestSecurity";
import { getSupabaseAdmin, sendEmail } from "@/lib/supabaseAdmin";
import { getEngineList } from "@/lib/engineConfigServer";

async function GETHandler() {
  try {
    const { data, error } = await getSupabaseAdmin().from("salons").select("id,name,address_city,address_state").ilike("status", "active").order("name").limit(1000);
    if (error) throw error;
    return Response.json({ salons: data || [] });
  } catch (error) {
    noteOperationalFailure("Complaint salon list failed", error);
    return Response.json({ error: "Unable to load businesses." }, { status: 500 });
  }
}

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "public-complaint", 3, 60 * 60_000);
    const body = await request.json() as Record<string, unknown>;
    rejectBot(body);
    const name = cleanText(body.name, 120);
    const email = cleanEmail(body.email);
    const salonId = cleanText(body.salonId, 50);
    const bookedThroughPlatform = body.bookedThroughPlatform === true || String(body.bookedThroughPlatform).toLowerCase() === "yes";
    const bookingEmail = bookedThroughPlatform ? cleanEmail(body.bookingEmail) : cleanText(body.bookingEmail, 254).toLowerCase();
    const reason=cleanText(body.reason,120);
    const issue = cleanText(body.issue, 5000);
    const allowedReasons=await getEngineList("quality.complaint_reasons",["Service quality","Safety or hygiene","Appointment timing","Pricing or payment","Professional conduct","Other"],40);
    if (name.length < 2 || !salonId || !allowedReasons.includes(reason) || issue.length < 20) throw new Error("Please complete every complaint field and describe the issue in at least 20 characters.");

    const admin = getSupabaseAdmin();
    const { data: salon, error: salonError } = await admin.from("salons").select("id,name").eq("id", salonId).ilike("status", "active").maybeSingle();
    if (salonError || !salon) throw new Error("Choose an active Girlz Culture business.");
    const fingerprint = createHash("sha256").update(`${clientAddress(request)}:${process.env.COMPLAINT_RATE_LIMIT_SALT || "girlz-culture"}`).digest("hex");
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count: recentCount } = await admin.from("complaints_log").select("id", { count: "exact", head: true }).eq("submitted_fingerprint", fingerprint).gte("created_at", oneHourAgo);
    if (Number(recentCount || 0) >= 3) throw new RateLimitError(3600);

    let booking: { id: string } | null = null;
    if (bookedThroughPlatform) {
      const { data, error: bookingError } = await admin
        .from("bookings")
        .select("id")
        .eq("salon_id", salonId)
        .eq("normalized_guest_email", bookingEmail)
        .order("appointment_datetime", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (bookingError) throw bookingError;
      booking = data;
    }
    const verified = Boolean(booking?.id);
    const { data: complaint, error: complaintError } = await admin.from("complaints_log").insert({
      salon_id: salonId,
      booking_id: verified ? booking?.id : null,
      category: reason,
      description: issue,
      issue_description: issue,
      status: "Open",
      complainant_name: name,
      complainant_email: email,
      booked_through_platform: bookedThroughPlatform,
      booking_email_normalized: bookingEmail || null,
      booking_verified: verified,
      verification_method: verified ? "booking_email" : null,
      submitted_fingerprint: fingerprint,
    }).select("id").single();
    if (complaintError) throw complaintError;
    const verificationNote = verified
      ? "Booking verified automatically. This complaint is included in quality monitoring."
      : bookedThroughPlatform
        ? "Booking could not be matched to this salon and email. Human review is required; this complaint does not affect the salon quality score."
        : "Customer said they did not book through Girlz Culture. Human review is required; this complaint does not affect the salon quality score.";
    const { data: ticket, error: ticketError } = await admin.from("support_tickets").insert({
      salon_id: salonId,
      complaint_id: complaint.id,
      booking_verified: verified,
      requester_name: name,
      requester_email: email,
      subject: `Complaint — ${reason}: ${salon.name}`,
      category: "Complaint",
      message: `${issue}\n\n${verificationNote}`,
      status: "Open",
      priority: "High",
    }).select("id").single();
    if (ticketError) throw ticketError;
    await admin.from("complaints_log").update({ support_ticket_id: ticket.id }).eq("id", complaint.id);
    let deliveryReference: string | null = null;
    try {
      await sendEmail(email, `We received your Girlz Culture complaint — ${salon.name}`, `<h1>Your complaint was received</h1><p>Hello ${name},</p><p>Our support team received your complaint about ${salon.name}. Reference: ${ticket.id}.</p><p>We will review the details and respond to this email address.</p>`, "support");
    } catch (deliveryError) {
      deliveryReference = await capturePlatformError({
        request, admin, error: deliveryError, feature: "complaints", action: "send-receipt",
        actorRole: "public", salonId, recordType: "complaint", recordId: complaint.id,
        provider: "email",
        safeMessage: "Your complaint was saved, but its confirmation email could not be delivered.",
      });
    }
    console.info("Public complaint created", { complaintId: complaint.id, ticketId: ticket.id, verified });
    return Response.json({
      ok: true,
      ticketId: ticket.id,
      verified,
      warning: deliveryReference
        ? {
            message: `Your complaint was saved, but its confirmation email could not be delivered. Reference ${deliveryReference}.`,
            request_id: deliveryReference,
          }
        : null,
    });
  } catch (error) {
    noteOperationalFailure("Public complaint submission failed", error);
    return errorResponse(error, "Unable to submit your complaint.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/complaints", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/complaints", "POST"), POSTHandler);
