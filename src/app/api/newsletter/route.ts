import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const { email: rawEmail, source = "footer" } = await request.json() as { email?: string; source?: string };
    const email = rawEmail?.trim().toLowerCase() || "";
    if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    const { error } = await getSupabaseAdmin().from("newsletter_subscribers").upsert({ email, source, status: "Active", updated_at: new Date().toISOString() }, { onConflict: "email" });
    if (error) throw error;
    console.info("Newsletter subscription saved", { email, source });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Newsletter subscription failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to subscribe" }, { status: 500 });
  }
}
