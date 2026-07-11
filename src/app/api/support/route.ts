import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanEmail, cleanText, enforceRateLimit, errorResponse, rejectBot } from "@/lib/requestSecurity";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request,"public-support",5,10*60_000);
    const body = await request.json() as Record<string, unknown>;
    rejectBot(body);
    const name = cleanText(body.name,120);
    const email = cleanEmail(body.email);
    const subject = cleanText(body.subject,180);
    const category = cleanText(body.category || "General",80);
    const message = cleanText(body.message,5000);
    if (name.length < 2 || subject.length < 3 || message.length < 10) {
      return Response.json({ error: "Please complete every field with valid information." }, { status: 400 });
    }
    const { data, error } = await getSupabaseAdmin().from("support_tickets").insert({ requester_name: name, requester_email: email, subject, category, message, status: "Open", priority: category === "Safety concern" ? "High" : "Normal" }).select("id").single();
    if (error) throw error;
    console.info("Public support request created", { ticketId: data.id, category });
    return Response.json({ ok: true, ticketId: data.id });
  } catch (error) {
    console.error("Public support request failed", error);
    return errorResponse(error,"Unable to submit your request");
  }
}
