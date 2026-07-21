import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertEmailAvailableForNewIdentity,
  auditIdentityEvent,
  IdentityUnavailableError,
  type PrimaryIdentityRole,
} from "@/lib/identityServer";

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
    throw new IdentityUnavailableError();
  }
  await auditIdentityEvent({
    request: context.request,
    eventType: "identity_invited",
    email,
    role: primaryRole,
    source: context.source,
    actorUserId: context.actorUserId,
  });
  return { user: data.user, invited: true };
}
