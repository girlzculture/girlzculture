import { cleanEmail, cleanText, cleanUsPhone, errorResponse } from "@/lib/requestSecurity";
import { requireAdmin, requireAdminPermission, sendEmail } from "@/lib/supabaseAdmin";
import { inviteNewIdentity } from "@/lib/teamInvite";
import { assertCompanyAdminEmail } from "@/lib/adminSecurityServer";
import { assertRecentHighRiskVerification, identityDependencySummary, prepareAndDeleteIdentity } from "@/lib/identityDeletionServer";

export const ADMIN_PERMISSION_KEYS = ["overview","submissions","salons","customers","bookings","quality","reviews","finance","marketing","content","support","subscriptions","settings"] as const;
function permissions(value: unknown) { const input = value && typeof value === "object" ? value as Record<string, unknown> : {}; return Object.fromEntries(ADMIN_PERMISSION_KEYS.map((key) => [key, Boolean(input[key])])); }
async function superAdmin(request: Request) { const context = await requireAdmin(request); if (!(context.adminUser as { is_super_admin?: boolean }).is_super_admin) throw new Error("Only a Super Admin can manage platform users."); return context; }
async function audit(admin: Awaited<ReturnType<typeof requireAdmin>>["admin"], actorUserId: string, targetUserId: string | null, action: string, details: Record<string,unknown> = {}) { const { error } = await admin.from("admin_security_events").insert({ actor_user_id: actorUserId, target_user_id: targetUserId, action, details }); if (error) console.error("Admin team audit failed", { action, code: error.code }); }
async function assertNotProtected(admin: Awaited<ReturnType<typeof requireAdmin>>["admin"], actingUserId: string, target: { user_id?: string; is_super_admin?: boolean; status?: string }) { if (target.user_id === actingUserId) throw new Error("You cannot suspend, revoke, or remove your own admin account."); if (target.is_super_admin && target.status === "Active") { const { count, error } = await admin.from("admin_users").select("id", { count:"exact", head:true }).eq("is_super_admin", true).eq("status", "Active"); if (error) throw error; if ((count || 0) <= 1) throw new Error("The last active Super Admin cannot be suspended, revoked, or removed."); } }

export async function GET(request: Request) {
  try { const { admin, adminUser } = await requireAdminPermission(request, "settings"); const { data, error } = await admin.from("admin_users").select("id,user_id,name,email,phone,role,status,permissions,is_super_admin,invited_at,activated_at").order("email"); if (error) throw error; return Response.json({ users: data || [], can_manage: Boolean((adminUser as { is_super_admin?: boolean }).is_super_admin) }); }
  catch (error) { return errorResponse(error, "Unable to load admin users."); }
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await superAdmin(request); const body = await request.json() as Record<string, unknown>;
    const email = assertCompanyAdminEmail(cleanEmail(body.email)); const phone = cleanUsPhone(body.phone); const name = cleanText(body.name, 120); const role = cleanText(body.role, 80) || "Admin";
    if (!name) throw new Error("Name is required.");
    const grantedPermissions = permissions(body.permissions);
    if (!Object.values(grantedPermissions).some(Boolean)) throw new Error("Assign at least one platform permission.");
    const invited = await inviteNewIdentity(admin, email, "admin", { request, actorUserId: user.id, source: "admin_team_invitation" });
    const requestedStatus = cleanText(body.status, 20) === "Inactive" ? "Inactive" : "Invited";
    const { data: existing, error: existingError } = await admin.from("admin_users").select("id,is_super_admin").ilike("email", email).limit(1).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.is_super_admin) throw new Error("A Super Admin cannot be replaced from this form.");
    const values = { user_id: invited.user.id, name, email, phone, role, status: requestedStatus, permissions: grantedPermissions, is_super_admin: false, invited_by: user.id, activated_at: null, last_invite_sent_at: new Date().toISOString() };
    const saved = existing?.id
      ? await admin.from("admin_users").update(values).eq("id", existing.id).select().single()
      : await admin.from("admin_users").insert({ id: invited.user.id, ...values, invited_at: new Date().toISOString() }).select().single();
    const { data, error } = saved;
    if (error) { await admin.auth.admin.deleteUser(invited.user.id); throw error; } await audit(admin,user.id,invited.user.id,"admin_invited",{role}); return Response.json({ user: data, invitation_sent: true });
  } catch (error) { console.error("Admin team invitation failed", error); return errorResponse(error, "Unable to invite admin user."); }
}

export async function PATCH(request: Request) {
  try { const { admin, user } = await superAdmin(request); const body = await request.json() as Record<string, unknown>; const id = cleanText(body.id, 50); const action = cleanText(body.action, 30); const { data:target,error:targetError } = await admin.from("admin_users").select("*").eq("id",id).single(); if(targetError||!target)throw targetError||new Error("Admin user not found.");
    if(action==="resend"){if(target.status!=="Invited")throw new Error("Invitations can be resent only while access is pending.");const sentAt=target.last_invite_sent_at?new Date(target.last_invite_sent_at).getTime():0;if(Date.now()-sentAt<60_000)throw new Error("Please wait 60 seconds before resending this invitation.");const redirectTo=`${(process.env.NEXT_PUBLIC_SITE_URL||"https://girlzculture.com").replace(/\/$/,"")}/reset-password?invited=admin`;const link=await admin.auth.admin.generateLink({type:"recovery",email:target.email,options:{redirectTo}});if(link.error||!link.data.properties?.action_link)throw link.error||new Error("Unable to create invitation link.");await sendEmail(target.email,"Your Girlz Culture admin invitation",`<h1>Complete your platform-admin access</h1><p><a href="${link.data.properties.action_link}">Set your password and verify your email</a></p><p>This private invitation was requested by a Girlz Culture Super Admin.</p>`,"security");const {data,error}=await admin.from("admin_users").update({last_invite_sent_at:new Date().toISOString()}).eq("id",id).select().single();if(error)throw error;await audit(admin,user.id,target.user_id,"admin_invitation_resent");return Response.json({user:data,invitation_sent:true});}
    if(["suspend","revoke","reactivate"].includes(action)){if(action!=="reactivate")await assertNotProtected(admin,user.id,target);const status=action==="suspend"?"Suspended":action==="revoke"?"Revoked":"Active";if(target.user_id){const authUpdate=await admin.auth.admin.updateUserById(target.user_id,{ban_duration:status==="Active"?"none":"876000h"});if(authUpdate.error)throw authUpdate.error;const identityUpdate=await admin.from("platform_identities").update({status:status==="Active"?"Active":"Disabled",disabled_at:status==="Active"?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("user_id",target.user_id);if(identityUpdate.error)throw identityUpdate.error;}const timestamps={suspended_at:status==="Suspended"?new Date().toISOString():null,revoked_at:status==="Revoked"?new Date().toISOString():null};const {data,error}=await admin.from("admin_users").update({status,...timestamps}).eq("id",id).select().single();if(error)throw error;await audit(admin,user.id,target.user_id,`admin_${action}`);return Response.json({user:data});}
    const updatedPermissions=permissions(body.permissions);if(!target.is_super_admin&&!Object.values(updatedPermissions).some(Boolean))throw new Error("Assign at least one platform permission.");const changes: Record<string, unknown> = { permissions: updatedPermissions }; if (body.name !== undefined) changes.name = cleanText(body.name, 120); if (body.phone !== undefined) changes.phone = cleanUsPhone(body.phone); if (body.role !== undefined) changes.role = cleanText(body.role, 80);
    if(body.status!==undefined){const active=cleanText(body.status,20)==="Active";if(!active)await assertNotProtected(admin,user.id,target);changes.status=active?"Active":"Suspended";changes.suspended_at=active?null:new Date().toISOString();if(target.user_id){const authUpdate=await admin.auth.admin.updateUserById(target.user_id,{ban_duration:active?"none":"876000h"});if(authUpdate.error)throw authUpdate.error;const identityUpdate=await admin.from("platform_identities").update({status:active?"Active":"Disabled",disabled_at:active?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("user_id",target.user_id);if(identityUpdate.error)throw identityUpdate.error;}}
    const { data, error } = await admin.from("admin_users").update(changes).eq("id", id).eq("is_super_admin", false).select().single(); if (error) throw error; await audit(admin,user.id,target.user_id,"admin_permissions_updated",{role:changes.role||target.role,status:changes.status||target.status}); return Response.json({ user: data }); }
  catch (error) { return errorResponse(error, "Unable to update admin user."); }
}

export async function DELETE(request: Request) {
  try { const { admin, user } = await superAdmin(request); await assertRecentHighRiskVerification(admin,user.id,"admin"); const id = new URL(request.url).searchParams.get("id") || ""; const {data:target,error:targetError}=await admin.from("admin_users").select("id,user_id,email,status,is_super_admin").eq("id",id).single();if(targetError||!target)throw targetError||new Error("Admin user not found.");await assertNotProtected(admin,user.id,target);if(target.user_id){const dependencies=await identityDependencySummary(admin,target.user_id,"admin",id);await prepareAndDeleteIdentity(admin,{targetUserId:target.user_id,role:"admin",targetRecordId:id,actorUserId:user.id,reason:"Removed from Settings & Team",dependencies});}else{const {error}=await admin.from("admin_users").delete().eq("id",id);if(error)throw error;}return Response.json({ removed: true, email_reusable: Boolean(target.user_id) }); }
  catch (error) { return errorResponse(error, "Unable to remove admin user."); }
}
