import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const subject = String(body.subject || "").trim();
    const category = String(body.category || "General").trim();
    const message = String(body.message || "").trim();
    if (body.website) return Response.json({ ok: true });
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || subject.length < 3 || message.length < 10) {
      return Response.json({ error: "Please complete every field with valid information." }, { status: 400 });
    }
    const { data, error } = await getSupabaseAdmin().from("support_tickets").insert({ requester_name: name, requester_email: email, subject, category, message, status: "Open", priority: category === "Safety concern" ? "High" : "Normal" }).select("id").single();
    if (error) throw error;
    console.info("Public support request created", { ticketId: data.id, category });
    return Response.json({ ok: true, ticketId: data.id });
  } catch (error) {
    console.error("Public support request failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to submit your request" }, { status: 500 });
  }
}
