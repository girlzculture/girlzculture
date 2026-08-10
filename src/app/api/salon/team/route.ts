import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanEmail, cleanText, cleanUsPhone, errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { inviteNewIdentity } from "@/lib/teamInvite";
import { compensateFailedInvitation } from "@/lib/teamInviteAtomicity";
import { compensateFailedTeamMutation } from "@/lib/teamMutationAtomicity";
import { assertRecentHighRiskVerification, identityDependencySummary, prepareAndDeleteIdentity } from "@/lib/identityDeletionServer";

export const SALON_PERMISSION_KEYS = ["overview","my_page","photos","styles","stylists","products","availability","bookings","reviews","earnings","promotions","settings"] as const;
function permissions(value: unknown) { const input = value && typeof value === "object" ? value as Record<string, unknown> : {}; return Object.fromEntries(SALON_PERMISSION_KEYS.map((key) => [key, Boolean(input[key])])); }
async function owner(request: Request) { const context = await requireSalonOwner(request); if (!context.isOwner) throw new Error("Only the salon owner can manage team users."); return context; }
function teamAuditSnapshot(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  return {
    id: value.id || null,
    user_id: value.user_id || null,
    stylist_id: value.stylist_id || null,
    role: value.role || null,
    status: value.status || null,
    permissions: value.permissions || {},
  };
}
async function auditTeamChange(
  admin: Awaited<ReturnType<typeof requireSalonOwner>>["admin"],
  input: {
    recordId: string;
    recordLabel: string;
    action: "Created" | "Updated" | "Deleted";
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    actorUserId: string;
    salonId: string;
  },
) {
  const { error } = await admin.from("record_management_events").insert({
    record_type: "salon_team_member",
    record_id: input.recordId,
    record_label: input.recordLabel,
    action: input.action,
    dependency_summary: { salon_id: input.salonId },
    before_values: input.before || null,
    after_values: input.after || null,
    reason: `Salon team member ${input.action.toLowerCase()} by salon owner`,
    acting_user_id: input.actorUserId,
    acting_scope: "salon_owner",
  });
  if (error) {
    noteOperationalFailure("Salon team audit failed", {
      recordId: input.recordId,
      action: input.action,
      salonId: input.salonId,
      error,
    });
    throw error;
  }
}

async function GETHandler(request: Request) {
  try { const { admin, salon, isOwner, teamMember } = await requireSalonOwner(request); if (!isOwner && !(teamMember?.permissions as Record<string,boolean>)?.settings) throw new Error("Forbidden"); const [{ data, error }, { data: stylists, error: stylistsError }] = await Promise.all([admin.from("salon_team_members").select("*").eq("salon_id", salon.id).order("name"), admin.from("stylists").select("id,name,user_id").eq("salon_id", salon.id).order("name")]); if (error) throw error; if (stylistsError) throw stylistsError; return Response.json({ users: data || [], stylists: stylists || [], can_manage: isOwner }); }
  catch (error) { return errorResponse(error, "Unable to load salon users."); }
}

async function POSTHandler(request: Request) {
  try {
    const { admin, salon, user } = await owner(request);
    const body = await request.json() as Record<string, unknown>;
    const email = cleanEmail(body.email);
    const phone = cleanUsPhone(body.phone);
    const name = cleanText(body.name, 120);
    const requestedRole = cleanText(body.role, 30);
    const role = ["Manager", "Front Desk", "Stylist", "Customer Service", "Staff"].includes(requestedRole)
      ? requestedRole
      : "Staff";
    const stylistId = cleanText(body.stylist_id, 50) || null;
    if (!name) throw new Error("Name is required.");
    if (role === "Stylist" && !stylistId) throw new Error("Choose the stylist profile linked to this login.");

    // Complete every fallible preflight before creating the Auth user. This
    // includes the legacy-row lookup that used to run after the email was sent.
    const [existingResult, stylistResult] = await Promise.all([
      admin
        .from("salon_team_members")
        .select("*")
        .eq("salon_id", salon.id)
        .ilike("email", email)
        .limit(1)
        .maybeSingle(),
      stylistId
        ? admin
          .from("stylists")
          .select("id,user_id")
          .eq("id", stylistId)
          .eq("salon_id", salon.id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (existingResult.error) throw existingResult.error;
    if (stylistResult.error) throw stylistResult.error;
    if (stylistId && !stylistResult.data) throw new Error("The selected stylist does not belong to this salon.");

    const existing = existingResult.data as Record<string, unknown> | null;
    const selectedStylist = stylistResult.data as { id: string; user_id: string | null } | null;
    const invited = await inviteNewIdentity(admin, email, "salon_staff", {
      request,
      actorUserId: user.id,
      source: "salon_team_invitation",
    });
    const requestedStatus = cleanText(body.status, 20) === "Inactive" ? "Inactive" : "Invited";
    const values = { salon_id: salon.id, user_id: invited.user.id, stylist_id: stylistId, email, phone, name, role, permissions: permissions(body.permissions), status: requestedStatus, invited_by: user.id, activated_at: invited.user.last_sign_in_at || null };
    let savedData: Record<string, unknown> | null = null;
    try {
      const saved = existing?.id
        ? await admin.from("salon_team_members").update(values).eq("id", existing.id).eq("salon_id", salon.id).select().single()
        : await admin.from("salon_team_members").insert(values).select().single();
      if (saved.error || !saved.data) throw saved.error || new Error("Salon team member was not saved.");
      savedData = saved.data as Record<string, unknown>;

      if (stylistId) {
        const stylistLink = await admin.from("stylists").update({ user_id: invited.user.id }).eq("id", stylistId).eq("salon_id", salon.id).select("id").single();
        if (stylistLink.error) throw stylistLink.error;
      }
      await auditTeamChange(admin, {
        recordId: String(savedData.id),
        recordLabel: name,
        action: existing?.id ? "Updated" : "Created",
        before: teamAuditSnapshot(existing),
        after: teamAuditSnapshot(savedData),
        actorUserId: user.id,
        salonId: salon.id,
      });
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
            name: "restore_salon_team_member",
            run: async () => {
              const restored = existing?.id
                ? await admin.from("salon_team_members").upsert(existing, { onConflict: "id" })
                : savedData?.id
                  ? await admin.from("salon_team_members").delete().eq("id", savedData.id).eq("salon_id", salon.id)
                  : { error: null };
              if (restored.error) throw restored.error;
            },
          },
          ...(stylistId && selectedStylist
            ? [{
              name: "restore_stylist_link",
              run: async () => {
                const restored = await admin
                  .from("stylists")
                  .update({ user_id: selectedStylist.user_id })
                  .eq("id", stylistId)
                  .eq("salon_id", salon.id);
                if (restored.error) throw restored.error;
              },
            }]
            : []),
        ],
        audit: (outcome) => invited.auditCompensation(outcome),
      });
    }
  } catch (error) { noteOperationalFailure("Salon team invitation failed", error); return errorResponse(error, "Unable to invite salon user."); }
}

async function PATCHHandler(request: Request) {
  try {
    const { admin, salon, user } = await owner(request);
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 50);
    const { data: existing, error: existingError } = await admin.from("salon_team_members").select("*").eq("id", id).eq("salon_id", salon.id).single();
    if (existingError || !existing) throw existingError || new Error("Salon team member not found.");
    const requestedRole = cleanText(body.role, 30);
    const role = ["Manager", "Front Desk", "Stylist", "Customer Service", "Staff"].includes(requestedRole) ? requestedRole : "Staff";
    const stylistId = cleanText(body.stylist_id, 50) || null;
    if (role === "Stylist" && !stylistId) throw new Error("Choose the stylist profile linked to this login.");
    // Capture both link surfaces before changing anything. A downstream
    // unlink, link, or audit failure can therefore restore the exact prior
    // user_id values instead of leaving a partially applied edit.
    const [selectedStylistResult, previousStylistResult] = await Promise.all([
      stylistId
        ? admin.from("stylists").select("id,user_id").eq("id", stylistId).eq("salon_id", salon.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      existing.stylist_id
        ? admin.from("stylists").select("id,user_id").eq("id", existing.stylist_id).eq("salon_id", salon.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (selectedStylistResult.error) throw selectedStylistResult.error;
    if (previousStylistResult.error) throw previousStylistResult.error;
    if (stylistId && !selectedStylistResult.data) throw new Error("The selected stylist does not belong to this salon.");
    if (existing.stylist_id && !previousStylistResult.data) throw new Error("The current stylist link no longer belongs to this salon.");
    const selectedStylist = selectedStylistResult.data as { id: string; user_id: string | null } | null;
    const previousStylist = previousStylistResult.data as { id: string; user_id: string | null } | null;
    const changes = { name: cleanText(body.name, 120), phone: cleanUsPhone(body.phone), role, status: cleanText(body.status, 20) === "Inactive" ? "Inactive" : "Active", stylist_id: stylistId, permissions: permissions(body.permissions) };
    let updatedMember: Record<string, unknown> | null = null;
    try {
      const { data, error } = await admin.from("salon_team_members").update(changes).eq("id", id).eq("salon_id", salon.id).select().single();
      if (error || !data) throw error || new Error("Salon team member was not updated.");
      updatedMember = data as Record<string, unknown>;
      if (existing.stylist_id && existing.stylist_id !== changes.stylist_id) {
        const unlinked = await admin.from("stylists").update({ user_id: null }).eq("id", existing.stylist_id).eq("salon_id", salon.id).select("id").single();
        if (unlinked.error) throw unlinked.error;
      }
      if (changes.stylist_id) {
        const linked = await admin.from("stylists").update({ user_id: existing.user_id }).eq("id", changes.stylist_id).eq("salon_id", salon.id).select("id").single();
        if (linked.error) throw linked.error;
      }
      await auditTeamChange(admin, {
        recordId: id,
        recordLabel: String(data.name || existing.name || existing.email || "Salon team member"),
        action: "Updated",
        before: teamAuditSnapshot(existing),
        after: teamAuditSnapshot(data),
        actorUserId: user.id,
        salonId: salon.id,
      });
      return Response.json({ user: data });
    } catch (operationError) {
      return await compensateFailedTeamMutation({
        cause: operationError,
        actions: [
          {
            name: "restore_team_member",
            run: async () => {
              const restored = await admin
                .from("salon_team_members")
                .update({
                  name: existing.name,
                  phone: existing.phone,
                  role: existing.role,
                  status: existing.status,
                  stylist_id: existing.stylist_id,
                  permissions: existing.permissions,
                })
                .eq("id", id)
                .eq("salon_id", salon.id)
                .select("id")
                .single();
              if (restored.error) throw restored.error;
            },
          },
          ...(selectedStylist && selectedStylist.id !== previousStylist?.id
            ? [{
              name: "restore_selected_stylist_link",
              run: async () => {
                const restored = await admin
                  .from("stylists")
                  .update({ user_id: selectedStylist.user_id })
                  .eq("id", selectedStylist.id)
                  .eq("salon_id", salon.id)
                  .select("id")
                  .single();
                if (restored.error) throw restored.error;
              },
            }]
            : []),
          ...(previousStylist
            ? [{
              name: "restore_previous_stylist_link",
              run: async () => {
                const restored = await admin
                  .from("stylists")
                  .update({ user_id: previousStylist.user_id })
                  .eq("id", previousStylist.id)
                  .eq("salon_id", salon.id)
                  .select("id")
                  .single();
                if (restored.error) throw restored.error;
              },
            }]
            : []),
        ],
        audit: async (outcome) => {
          const { error } = await admin.from("record_management_events").insert({
            record_type: "salon_team_member",
            record_id: id,
            record_label: String(existing.name || existing.email || "Salon team member"),
            action: "Updated",
            dependency_summary: {
              salon_id: salon.id,
              rollback_complete: outcome.complete,
              failed_steps: outcome.failedSteps,
            },
            before_values: teamAuditSnapshot(updatedMember || { ...existing, ...changes }),
            after_values: teamAuditSnapshot(existing),
            reason: outcome.complete
              ? "Failed salon team member update automatically rolled back"
              : "Failed salon team member update rollback requires administrator review",
            acting_user_id: user.id,
            acting_scope: "salon_owner",
          });
          if (error) throw error;
        },
      });
    }
  } catch (error) {
    noteOperationalFailure("Salon team update failed", error);
    return errorResponse(error, "Unable to update salon user.");
  }
}

async function DELETEHandler(request: Request) {
  try {
    const { admin, salon, user } = await owner(request);
    await assertRecentHighRiskVerification(admin, user.id, "salon");
    const id = new URL(request.url).searchParams.get("id") || "";
    const { data: member, error: memberError } = await admin.from("salon_team_members").select("*").eq("id", id).eq("salon_id", salon.id).maybeSingle();
    if (memberError) throw memberError;
    if (!member) throw new Error("Salon team member not found.");
    if (member.user_id) {
      const dependencies = await identityDependencySummary(admin, member.user_id, "salon_team", id);
      await prepareAndDeleteIdentity(admin, { targetUserId: member.user_id, role: "salon_team", targetRecordId: id, actorUserId: user.id, reason: "Removed by salon owner", dependencies });
    } else {
      const { error } = await admin.from("salon_team_members").delete().eq("id", id).eq("salon_id", salon.id);
      if (error) throw error;
      if (member.stylist_id) {
        const unlinked = await admin.from("stylists").update({ user_id: null }).eq("id", member.stylist_id).eq("salon_id", salon.id).select("id").single();
        if (unlinked.error) throw unlinked.error;
      }
      await auditTeamChange(admin, {
        recordId: id,
        recordLabel: String(member.name || member.email || "Salon team member"),
        action: "Deleted",
        before: teamAuditSnapshot(member),
        after: null,
        actorUserId: user.id,
        salonId: salon.id,
      });
    }
    return Response.json({ removed: true, email_reusable: Boolean(member.user_id) });
  } catch (error) {
    noteOperationalFailure("Salon team removal failed", error);
    return errorResponse(error, "Unable to remove salon user.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/team", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/team", "POST"), POSTHandler);
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/salon/team", "PATCH"), PATCHHandler);
export const DELETE = withOperationalMonitoring(routeMonitoringProfile("/api/salon/team", "DELETE"), DELETEHandler);
