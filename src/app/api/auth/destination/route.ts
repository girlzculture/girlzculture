import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { canonicalIdentityForUser } from "@/lib/identityServer";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ path: "/login", role: "anonymous" }, { status: 401 });
    const admin = getSupabaseAdmin();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return Response.json({ path: "/login", role: "anonymous" }, { status: 401 });
    const user = authData.user;
    const identity = await canonicalIdentityForUser(user.id);
    if (identity?.status === "Disabled") return Response.json({ path: "/login", role: "disabled" }, { status: 403 });
    const [{ data: adminUser, error: adminError }, { data: salon, error: salonError }, { data: teamMember, error: teamError }] = await Promise.all([
      admin.from("admin_users").select("email,status,role,permissions,is_super_admin").eq("user_id", user.id).in("status", ["Invited", "Active"]).limit(1).maybeSingle(),
      admin.from("salons").select("id,status").eq("user_id", user.id).limit(1).maybeSingle(),
      admin.from("salon_team_members").select("id,salon_id,status,permissions,role,stylist_id").eq("user_id", user.id).in("status", ["Invited", "Active"]).limit(1).maybeSingle(),
    ]);
    if (adminError) throw adminError;
    if (salonError) throw salonError;
    if (teamError) throw teamError;
    if (identity && ((identity.primary_role === "admin") !== Boolean(adminUser) || (identity.primary_role === "salon_owner") !== Boolean(salon) || (identity.primary_role === "salon_team") !== Boolean(teamMember))) {
      return Response.json({ path: "/login", role: "review_required" }, { status: 403 });
    }
    if (adminUser) return Response.json({ path: "/admin", role: "admin", permissions: adminUser.permissions || {}, is_super_admin: Boolean(adminUser.is_super_admin), roleConflict: false });
    if (salon) {
      let path = "/salon/dashboard";
      if (salon.status?.toLowerCase() === "pending") {
        const { data: application } = await admin.from("salon_applications").select("id").eq("salon_id", salon.id).maybeSingle();
        path = application?.id ? "/salon/dashboard" : "/salon/apply";
      }
      return Response.json({ path, role: "salon_owner" });
    }
    if (teamMember) {
      if (teamMember.status === "Invited") await admin.from("salon_team_members").update({ status: "Active", activated_at: new Date().toISOString() }).eq("id", teamMember.id);
      const [{ data: parentSubscription, error: subscriptionError }, { data: parentSalon, error: parentSalonError }] = await Promise.all([
        admin.from("subscriptions").select("*").eq("salon_id", teamMember.salon_id).limit(1).maybeSingle(),
        admin.from("salons").select("subscription_status,subscription_tier").eq("id", teamMember.salon_id).maybeSingle(),
      ]);
      if (subscriptionError) throw subscriptionError;
      if (parentSalonError) throw parentSalonError;
      return Response.json({
        path: "/salon/dashboard", role: "salon_owner", salon_id: teamMember.salon_id,
        permissions: teamMember.permissions || {}, team_role: teamMember.role,
        stylist_id: teamMember.stylist_id, is_team_member: true,
        parent_subscription: parentSubscription || (parentSalon ? { status: parentSalon.subscription_status, tier: parentSalon.subscription_tier } : null),
      });
    }
    return Response.json({ path: "/account", role: "customer" });
  } catch (error) {
    console.error("Role destination lookup failed", error);
    return Response.json({ path: "/login", role: "unknown", error: "Unable to verify account role" }, { status: 500 });
  }
}
