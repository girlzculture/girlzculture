import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ path: "/login", role: "anonymous" }, { status: 401 });
    const admin = getSupabaseAdmin();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return Response.json({ path: "/login", role: "anonymous" }, { status: 401 });
    const user = authData.user;
    const email = user.email?.trim().toLowerCase() || "";
    const [{ data: adminRows, error: adminError }, { data: salon, error: salonError }] = await Promise.all([
      admin.from("admin_users").select("email,status,role").ilike("email", email),
      admin.from("salons").select("id,status").eq("user_id", user.id).limit(1).maybeSingle(),
    ]);
    if (adminError) throw adminError;
    if (salonError) throw salonError;
    const isAdmin = (adminRows || []).some((row) => row.email?.trim().toLowerCase() === email && row.status !== "Inactive");
    if (isAdmin) return Response.json({ path: "/admin", role: "admin", roleConflict: Boolean(salon) });
    if (salon) {
      let path = "/salon/dashboard";
      if (salon.status?.toLowerCase() === "pending") {
        const { data: application } = await admin.from("salon_applications").select("id").eq("salon_id", salon.id).maybeSingle();
        path = application?.id ? "/salon/dashboard" : "/salon/apply";
      }
      return Response.json({ path, role: "salon_owner" });
    }
    return Response.json({ path: "/account", role: "customer" });
  } catch (error) {
    console.error("Role destination lookup failed", error);
    return Response.json({ path: "/login", role: "unknown", error: "Unable to verify account role" }, { status: 500 });
  }
}
