import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanEmail, cleanText, cleanUsPhone, errorResponse } from "@/lib/requestSecurity";
import { requireAdmin, requireAdminPermission, sendEmail } from "@/lib/supabaseAdmin";
import { inviteNewIdentity } from "@/lib/teamInvite";
import { compensateFailedInvitation } from "@/lib/teamInviteAtomicity";
import { runCompensatedAdminTeamUpdate } from "@/lib/adminTeamUpdateAtomicity";
import { assertCompanyAdminEmail } from "@/lib/adminSecurityServer";
import { assertRecentHighRiskVerification, identityDependencySummary, prepareAndDeleteIdentity } from "@/lib/identityDeletionServer";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import {
  isClearlyExpectedMessage,
  isPermissionDenialMessage,
} from "@/lib/operationalMonitoringCore";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverSiteUrl } from "@/lib/siteUrlServer";

export const ADMIN_PERMISSION_KEYS = ["overview","submissions","salons","customers","bookings","quality","reviews","finance","marketing","content","support","complaints","subscriptions","engine","settings"] as const;
function permissions(value: unknown) { const input = value && typeof value === "object" ? value as Record<string, unknown> : {}; return Object.fromEntries(ADMIN_PERMISSION_KEYS.map((key) => [key, Boolean(input[key])])); }
async function superAdmin(request: Request) { const context = await requireAdmin(request); if (!(context.adminUser as { is_super_admin?: boolean }).is_super_admin) throw new Error("Only a Super Admin can manage platform users."); return context; }
async function audit(admin: Awaited<ReturnType<typeof requireAdmin>>["admin"], actorUserId: string, targetUserId: string | null, action: string, details: Record<string,unknown> = {}) { const { error } = await admin.from("admin_security_events").insert({ actor_user_id: actorUserId, target_user_id: targetUserId, action, details }); if (error) { noteOperationalFailure("Admin team audit failed", { action, targetUserId, error }); throw error; } }
async function assertNotProtected(admin: Awaited<ReturnType<typeof requireAdmin>>["admin"], actingUserId: string, target: { user_id?: string; is_super_admin?: boolean; status?: string }) { if (target.user_id === actingUserId) throw new Error("You cannot suspend, revoke, or remove your own admin account."); if (target.is_super_admin && target.status === "Active") { const { count, error } = await admin.from("admin_users").select("id", { count:"exact", head:true }).eq("is_super_admin", true).eq("status", "Active"); if (error) throw error; if ((count || 0) <= 1) throw new Error("The last active Super Admin cannot be suspended, revoked, or removed."); } }

async function GETHandler(request: Request) {
  try { const { admin, adminUser } = await requireAdminPermission(request, "settings"); const { data, error } = await admin.from("admin_users").select("id,user_id,name,email,phone,role,status,permissions,is_super_admin,invited_at,activated_at,time_zone").order("email"); if (error) throw error; return Response.json({ users: data || [], can_manage: Boolean((adminUser as { is_super_admin?: boolean }).is_super_admin) }); }
  catch (error) { return errorResponse(error, "Unable to load admin users."); }
}

async function POSTHandler(request: Request) {
  try {
    const { admin, user } = await superAdmin(request);
    const body = await request.json() as Record<string, unknown>;
    const email = assertCompanyAdminEmail(cleanEmail(body.email));
    const phone = cleanUsPhone(body.phone);
    const name = cleanText(body.name, 120);
    const role = cleanText(body.role, 80) || "Admin";
    if (!name) throw new Error("Name is required.");
    const grantedPermissions = permissions(body.permissions);
    if (!Object.values(grantedPermissions).some(Boolean)) throw new Error("Assign at least one platform permission.");

    // Resolve every database validation before Auth sends the invitation. This
    // prevents lookup errors and protected-account checks from orphaning a new
    // login before the authorization row is written.
    const { data: existingData, error: existingError } = await admin
      .from("admin_users")
      .select("*")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    const existing = existingData as Record<string, unknown> | null;
    if (existing?.is_super_admin) throw new Error("A Super Admin cannot be replaced from this form.");

    const invited = await inviteNewIdentity(admin, email, "admin", {
      request,
      actorUserId: user.id,
      source: "admin_team_invitation",
    });
    const requestedStatus = cleanText(body.status, 20) === "Inactive" ? "Inactive" : "Invited";
    const values = { user_id: invited.user.id, name, email, phone, role, status: requestedStatus, permissions: grantedPermissions, is_super_admin: false, invited_by: user.id, activated_at: null, last_invite_sent_at: new Date().toISOString() };
    let savedData: Record<string, unknown> | null = null;
    try {
      const saved = existing?.id
        ? await admin.from("admin_users").update(values).eq("id", existing.id).select().single()
        : await admin.from("admin_users").insert({ id: invited.user.id, ...values, invited_at: new Date().toISOString() }).select().single();
      if (saved.error || !saved.data) throw saved.error || new Error("Admin user was not saved.");
      savedData = saved.data as Record<string, unknown>;
      await audit(admin, user.id, invited.user.id, "admin_invited", { role });
      await invited.finalize();
      return Response.json({ user: savedData, invitation_sent: true });
    } catch (operationError) {
      return await compensateFailedInvitation({
        cause: operationError,
        actions: [
          {
            name: "revoke_auth_identity",
            run: () => invited.revoke(),
          },
          {
            name: "restore_admin_user",
            run: async () => {
              const restored = existing?.id
                ? await admin.from("admin_users").upsert(existing, { onConflict: "id" })
                : savedData?.id
                  ? await admin.from("admin_users").delete().eq("id", savedData.id)
                  : { error: null };
              if (restored.error) throw restored.error;
            },
          },
        ],
        audit: (outcome) => invited.auditCompensation(outcome),
      });
    }
  } catch (error) { noteOperationalFailure("Admin team invitation failed", error); return errorResponse(error, "Unable to invite admin user."); }
}

type AdminTeamTarget = Record<string, unknown> & {
  id: string;
  user_id?: string;
  status?: string;
  is_super_admin?: boolean;
};

function priorChangedFields(
  target: AdminTeamTarget,
  changes: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.keys(changes).map((key) => [key, target[key] ?? null]),
  );
}

function isAuthUserBanned(user: Record<string, unknown>) {
  const bannedUntil = Date.parse(String(user.banned_until || ""));
  return Number.isFinite(bannedUntil) && bannedUntil > Date.now();
}

async function applyCompensatedAdminUpdate({
  admin,
  actorUserId,
  target,
  changes,
  action,
  auditDetails,
  desiredActive,
  allowSuperAdmin,
}: {
  admin: Awaited<ReturnType<typeof requireAdmin>>["admin"];
  actorUserId: string;
  target: AdminTeamTarget;
  changes: Record<string, unknown>;
  action: string;
  auditDetails?: Record<string, unknown>;
  desiredActive: boolean | null;
  allowSuperAdmin: boolean;
}) {
  const priorAdminFields = priorChangedFields(target, changes);
  let priorIdentity: Record<string, unknown> | null = null;
  let priorAuthBanned = false;

  if (target.user_id && desiredActive !== null) {
    const [identityResult, authResult] = await Promise.all([
      admin
        .from("platform_identities")
        .select("user_id,status,disabled_at,updated_at")
        .eq("user_id", target.user_id)
        .maybeSingle(),
      admin.auth.admin.getUserById(target.user_id),
    ]);
    if (identityResult.error) throw identityResult.error;
    if (!identityResult.data) throw new Error("ADMIN_IDENTITY_LINK_MISSING");
    if (authResult.error || !authResult.data.user) {
      throw authResult.error || new Error("ADMIN_AUTH_IDENTITY_MISSING");
    }
    priorIdentity = identityResult.data as Record<string, unknown>;
    priorAuthBanned = isAuthUserBanned(
      authResult.data.user as unknown as Record<string, unknown>,
    );
  }

  let saved: Record<string, unknown> | null = null;
  const steps = [
    {
      name: "admin_user_record",
      apply: async () => {
        const base = admin.from("admin_users").update(changes).eq("id", target.id);
        const result = allowSuperAdmin
          ? await base.select().single()
          : await base.eq("is_super_admin", false).select().single();
        if (result.error || !result.data) {
          throw result.error || new Error("ADMIN_USER_UPDATE_EMPTY");
        }
        saved = result.data as Record<string, unknown>;
      },
      compensate: async () => {
        const restored = await admin
          .from("admin_users")
          .update(priorAdminFields)
          .eq("id", target.id)
          .select("id")
          .single();
        if (restored.error) throw restored.error;
      },
    },
    ...(target.user_id && desiredActive !== null && priorIdentity
      ? [
          {
            name: "platform_identity",
            apply: async () => {
              const updated = await admin
                .from("platform_identities")
                .update({
                  status: desiredActive ? "Active" : "Disabled",
                  disabled_at: desiredActive ? null : new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", target.user_id!)
                .select("user_id")
                .single();
              if (updated.error) throw updated.error;
            },
            compensate: async () => {
              const restored = await admin
                .from("platform_identities")
                .update({
                  status: priorIdentity!.status,
                  disabled_at: priorIdentity!.disabled_at,
                  updated_at: priorIdentity!.updated_at,
                })
                .eq("user_id", target.user_id!)
                .select("user_id")
                .single();
              if (restored.error) throw restored.error;
            },
          },
          {
            name: "auth_access",
            apply: async () => {
              const result = await admin.auth.admin.updateUserById(
                target.user_id!,
                { ban_duration: desiredActive ? "none" : "876000h" },
              );
              if (result.error) throw result.error;
            },
            compensate: async () => {
              const result = await admin.auth.admin.updateUserById(
                target.user_id!,
                { ban_duration: priorAuthBanned ? "876000h" : "none" },
              );
              if (result.error) throw result.error;
            },
          },
        ]
      : []),
    {
      name: "security_audit",
      apply: () =>
        audit(
          admin,
          actorUserId,
          target.user_id || null,
          action,
          auditDetails,
        ),
      // This is the final forward step, so no later operation can require an
      // audit rollback. If its insert fails it is never added to the applied
      // stack and all authorization steps are compensated.
      compensate: async () => {},
    },
  ];

  await runCompensatedAdminTeamUpdate({
    steps,
    auditCompensation: async (outcome) => {
      const compensation = await admin.from("admin_security_events").insert({
        actor_user_id: actorUserId,
        target_user_id: target.user_id || null,
        action: outcome.complete
          ? "admin_update_compensated"
          : "admin_update_compensation_failed",
        result: outcome.complete ? "Succeeded" : "Failed",
        details: {
          requested_action: action,
          cleanup_complete: outcome.complete,
          failed_steps: outcome.failedSteps,
        },
      });
      if (compensation.error) throw compensation.error;
    },
  });
  if (!saved) throw new Error("ADMIN_USER_UPDATE_EMPTY");
  return saved;
}

async function PATCHHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  let actorId: string | null = null;
  let targetId: string | null = null;
  try {
    const { admin, user } = await superAdmin(request);
    monitoringAdmin = admin;
    actorId = user.id;
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 50);
    targetId = id || null;
    const action = cleanText(body.action, 30);
    const { data: targetData, error: targetError } = await admin
      .from("admin_users")
      .select("*")
      .eq("id", id)
      .single();
    if (targetError || !targetData) {
      throw targetError || new Error("Admin user not found.");
    }
    const target = targetData as AdminTeamTarget;

    if (action === "resend") {
      if (target.status !== "Invited") {
        throw new Error("Invitations can be resent only while access is pending.");
      }
      const sentAt = target.last_invite_sent_at
        ? new Date(String(target.last_invite_sent_at)).getTime()
        : 0;
      if (Date.now() - sentAt < 60_000) {
        throw new Error("Please wait 60 seconds before resending this invitation.");
      }
      const redirectTo = `${serverSiteUrl(request)}/reset-password?invited=admin`;
      const link = await admin.auth.admin.generateLink({
        type: "recovery",
        email: String(target.email || ""),
        options: { redirectTo },
      });
      if (link.error || !link.data.properties?.action_link) {
        throw link.error || new Error("Unable to create invitation link.");
      }
      await sendEmail(
        String(target.email || ""),
        "Your Girlz Culture admin invitation",
        `<h1>Complete your platform-admin access</h1><p><a href="${link.data.properties.action_link}">Set your password and verify your email</a></p><p>This private invitation was requested by a Girlz Culture Super Admin.</p>`,
        "security",
      );
      const { data, error } = await admin
        .from("admin_users")
        .update({ last_invite_sent_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await audit(
        admin,
        user.id,
        target.user_id || null,
        "admin_invitation_resent",
      );
      return Response.json({ user: data, invitation_sent: true });
    }

    if (["suspend", "revoke", "reactivate"].includes(action)) {
      if (action !== "reactivate") {
        await assertNotProtected(admin, user.id, target);
      }
      const status =
        action === "suspend"
          ? "Suspended"
          : action === "revoke"
            ? "Revoked"
            : "Active";
      const data = await applyCompensatedAdminUpdate({
        admin,
        actorUserId: user.id,
        target,
        changes: {
          status,
          suspended_at: status === "Suspended" ? new Date().toISOString() : null,
          revoked_at: status === "Revoked" ? new Date().toISOString() : null,
        },
        action: `admin_${action}`,
        desiredActive: status === "Active",
        allowSuperAdmin: true,
      });
      return Response.json({ user: data });
    }

    if (target.is_super_admin) {
      throw new Error("A Super Admin cannot be edited from this permissions form.");
    }
    const updatedPermissions = permissions(body.permissions);
    if (!Object.values(updatedPermissions).some(Boolean)) {
      throw new Error("Assign at least one platform permission.");
    }
    const changes: Record<string, unknown> = {
      permissions: updatedPermissions,
    };
    if (body.name !== undefined) changes.name = cleanText(body.name, 120);
    if (body.phone !== undefined) changes.phone = cleanUsPhone(body.phone);
    if (body.role !== undefined) changes.role = cleanText(body.role, 80);
    let desiredActive: boolean | null = null;
    if (body.status !== undefined) {
      desiredActive = cleanText(body.status, 20) === "Active";
      if (!desiredActive) await assertNotProtected(admin, user.id, target);
      changes.status = desiredActive ? "Active" : "Suspended";
      changes.suspended_at = desiredActive ? null : new Date().toISOString();
      if (desiredActive) changes.revoked_at = null;
    }
    const data = await applyCompensatedAdminUpdate({
      admin,
      actorUserId: user.id,
      target,
      changes,
      action: "admin_permissions_updated",
      auditDetails: {
        role: changes.role || target.role,
        status: changes.status || target.status,
      },
      desiredActive,
      allowSuperAdmin: false,
    });
    return Response.json({ user: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      isClearlyExpectedMessage(message) ||
      isPermissionDenialMessage(message)
    ) {
      return errorResponse(error, "Unable to update admin user.");
    }
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "admin-team",
      action: "update-admin-user",
      actorRole: "admin",
      actorId,
      recordType: "admin_user",
      recordId: targetId,
      provider: "supabase-auth",
      safeMessage: "We couldn't update this administrator account.",
    });
  }
}

async function DELETEHandler(request: Request) {
  try { const { admin, user } = await superAdmin(request); await assertRecentHighRiskVerification(admin,user.id,"admin"); const id = new URL(request.url).searchParams.get("id") || ""; const {data:target,error:targetError}=await admin.from("admin_users").select("id,user_id,email,status,is_super_admin").eq("id",id).single();if(targetError||!target)throw targetError||new Error("Admin user not found.");await assertNotProtected(admin,user.id,target);if(target.user_id){const dependencies=await identityDependencySummary(admin,target.user_id,"admin",id);await prepareAndDeleteIdentity(admin,{targetUserId:target.user_id,role:"admin",targetRecordId:id,actorUserId:user.id,reason:"Removed from Settings & Team",dependencies});}else{const {error}=await admin.from("admin_users").delete().eq("id",id);if(error)throw error;}return Response.json({ removed: true, email_reusable: Boolean(target.user_id) }); }
  catch (error) { return errorResponse(error, "Unable to remove admin user."); }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/team", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/team", "POST"), POSTHandler);
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/admin/team", "PATCH"), PATCHHandler);
export const DELETE = withOperationalMonitoring(routeMonitoringProfile("/api/admin/team", "DELETE"), DELETEHandler);
