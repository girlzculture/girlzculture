import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertEmailAvailableForNewIdentity,
  auditIdentityEvent,
  type PrimaryIdentityRole,
} from "@/lib/identityServer";
import type { InvitationCompensationOutcome } from "@/lib/teamInviteAtomicity";

function authUserIsMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = String(record.code || "").toLowerCase();
  const message = String(record.message || "").toLowerCase();
  return Number(record.status || 0) === 404
    || code.includes("user_not_found")
    || message.includes("user not found");
}

export async function inviteNewIdentity(
  admin: SupabaseClient,
  email: string,
  role: "admin" | "salon_staff",
  context: { request: Request; actorUserId: string; source: string },
) {
  const primaryRole: PrimaryIdentityRole = role === "admin" ? "admin" : "salon_team";
  await assertEmailAvailableForNewIdentity(
    email,
    primaryRole,
    context.source,
    context.request,
    context.actorUserId,
  );
  const redirectTo = `${(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "")}/reset-password?invited=${role}`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { role, invitation_pending: true } });
  if (error || !data.user) {
    await auditIdentityEvent({
      request: context.request,
      eventType: "identity_invitation_rejected",
      email,
      role: primaryRole,
      source: context.source,
      actorUserId: context.actorUserId,
      details: { provider_code: error?.code || "no_user" },
    });
    throw Object.assign(
      new Error("SUPABASE_AUTH_INVITATION_FAILED"),
      { code: error?.code || "NO_USER_RETURNED" },
    );
  }
  let finalized = false;
  let revoked = false;
  return {
    user: data.user,
    invited: true as const,
    async finalize() {
      if (finalized) return;
      await auditIdentityEvent({
        request: context.request,
        eventType: "identity_invited",
        email,
        role: primaryRole,
        source: context.source,
        actorUserId: context.actorUserId,
      });
      finalized = true;
    },
    async revoke() {
      if (revoked) return;

      // Disable first so a provider-side delete failure cannot leave an active
      // login with a valid invitation. Deletion then removes the canonical
      // identity and invalidates the emailed invitation link.
      const disabled = await admin.auth.admin.updateUserById(data.user.id, {
        ban_duration: "876000h",
      });
      const deleted = await admin.auth.admin.deleteUser(data.user.id);
      if (!deleted.error || authUserIsMissing(deleted.error)) {
        revoked = true;
        return;
      }

      // Keep the canonical identity disabled when Auth deletion is temporarily
      // unavailable. The route compensation still removes all authorization
      // rows and retries deletion before returning an error.
      await admin
        .from("platform_identities")
        .update({
          status: "Disabled",
          disabled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", data.user.id);

      const cleanupError = new Error("IDENTITY_INVITATION_REVOCATION_FAILED");
      Object.assign(cleanupError, {
        code: "IDENTITY_INVITATION_REVOCATION_FAILED",
        disableFailed: Boolean(disabled.error && !authUserIsMissing(disabled.error)),
      });
      throw cleanupError;
    },
    async auditCompensation(outcome: InvitationCompensationOutcome) {
      await auditIdentityEvent({
        request: context.request,
        eventType: outcome.complete
          ? "identity_invitation_compensated"
          : "identity_invitation_compensation_failed",
        email,
        role: primaryRole,
        source: context.source,
        actorUserId: context.actorUserId,
        details: {
          cleanup_complete: outcome.complete,
          failed_steps: outcome.failedSteps,
        },
      });
    },
  };
}
