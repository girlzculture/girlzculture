import { cleanEmail, cleanText, cleanUsPhone, errorResponse } from "@/lib/requestSecurity";
import { requireAdmin, requireAdminPermission } from "@/lib/supabaseAdmin";
import { inviteOrFindUser } from "@/lib/teamInvite";

export const ADMIN_PERMISSION_KEYS = ["overview","submissions","salons","customers","bookings","quality","reviews","finance","marketing","content","support","subscriptions","settings"] as const;
function permissions(value: unknown) { const input = value && typeof value === "object" ? value as Record<string, unknown> : {}; return Object.fromEntries(ADMIN_PERMISSION_KEYS.map((key) => [key, Boolean(input[key])])); }
async function superAdmin(request: Request) { const context = await requireAdmin(request); if (!(context.adminUser as { is_super_admin?: boolean }).is_super_admin) throw new Error("Only a Super Admin can manage platform users."); return context; }

export async function GET(request: Request) {
  try { const { admin, adminUser } = await requireAdminPermission(request, "settings"); const { data, error } = await admin.from("admin_users").select("id,user_id,name,email,phone,role,status,permissions,is_super_admin,invited_at,activated_at").order("email"); if (error) throw error; return Response.json({ users: data || [], can_manage: Boolean((adminUser as { is_super_admin?: boolean }).is_super_admin) }); }
  catch (error) { return errorResponse(error, "Unable to load admin users."); }
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await superAdmin(request); const body = await request.json() as Record<string, unknown>;
    const email = cleanEmail(body.email); const phone = cleanUsPhone(body.phone); const name = cleanText(body.name, 120); const role = cleanText(body.role, 80) || "Admin";
    if (!name) throw new Error("Name is required.");
    const invited = await inviteOrFindUser(admin, email, "admin");
    const requestedStatus = cleanText(body.status, 20) === "Inactive" ? "Inactive" : invited.user.last_sign_in_at ? "Active" : "Invited";
    const { data: existing, error: existingError } = await admin.from("admin_users").select("id,is_super_admin").ilike("email", email).limit(1).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.is_super_admin) throw new Error("A Super Admin cannot be replaced from this form.");
    const values = { user_id: invited.user.id, name, email, phone, role, status: requestedStatus, permissions: permissions(body.permissions), is_super_admin: false, invited_by: user.id, activated_at: invited.user.last_sign_in_at || null };
    const saved = existing?.id
      ? await admin.from("admin_users").update(values).eq("id", existing.id).select().single()
      : await admin.from("admin_users").insert({ id: invited.user.id, ...values, invited_at: new Date().toISOString() }).select().single();
    const { data, error } = saved;
    if (error) throw error; return Response.json({ user: data, invitation_sent: invited.invited });
  } catch (error) { console.error("Admin team invitation failed", error); return errorResponse(error, "Unable to invite admin user."); }
}

export async function PATCH(request: Request) {
  try { const { admin } = await superAdmin(request); const body = await request.json() as Record<string, unknown>; const id = cleanText(body.id, 50); const changes: Record<string, unknown> = { permissions: permissions(body.permissions) }; if (body.name !== undefined) changes.name = cleanText(body.name, 120); if (body.phone !== undefined) changes.phone = cleanUsPhone(body.phone); if (body.role !== undefined) changes.role = cleanText(body.role, 80); if (body.status !== undefined) changes.status = cleanText(body.status, 20) === "Inactive" ? "Inactive" : "Active"; const { data, error } = await admin.from("admin_users").update(changes).eq("id", id).eq("is_super_admin", false).select().single(); if (error) throw error; return Response.json({ user: data }); }
  catch (error) { return errorResponse(error, "Unable to update admin user."); }
}

export async function DELETE(request: Request) {
  try { const { admin } = await superAdmin(request); const id = new URL(request.url).searchParams.get("id") || ""; const { error } = await admin.from("admin_users").delete().eq("id", id).eq("is_super_admin", false); if (error) throw error; return Response.json({ removed: true }); }
  catch (error) { return errorResponse(error, "Unable to remove admin user."); }
}
