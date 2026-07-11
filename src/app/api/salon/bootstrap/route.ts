import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const { userId, email, phone } = await request.json();
    const admin = getSupabaseAdmin();
    const { data } = await admin.auth.admin.getUserById(userId);
    if (!data.user || data.user.email?.toLowerCase() !== String(email).toLowerCase()) return Response.json({ error: "Invalid account" }, { status: 403 });
    const { data: existing } = await admin.from("salons").select("id,status").eq("user_id", userId).maybeSingle();
    if (existing) return Response.json({ salon: existing });
    const slug = `pending-${userId.slice(0,8)}`;
    const { data: salon, error } = await admin.from("salons").insert({ user_id: userId, email, phone, name: "Pending salon application", slug, status: "Pending", verification_status: "Pending", subscription_tier: "Basic" }).select("id,status").single();
    if (error) throw error;
    return Response.json({ salon });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create salon" }, { status: 500 });
  }
}
