export type CanonicalSalonIdentity = {
  email_normalized?: string | null;
  primary_role?: string | null;
  status?: string | null;
};

export type SalonIdentityScope = "owner" | "team";

export function resolveSalonIdentityScope(
  identity: CanonicalSalonIdentity | null | undefined,
  authenticatedEmail: string | null | undefined,
): SalonIdentityScope | null {
  const normalizedEmail = authenticatedEmail?.trim().toLowerCase() || "";
  if (
    !identity ||
    identity.status !== "Active" ||
    !normalizedEmail ||
    identity.email_normalized !== normalizedEmail
  ) {
    return null;
  }
  if (identity.primary_role === "salon_owner") return "owner";
  if (identity.primary_role === "salon_team") return "team";
  return null;
}

export function isActiveSalonTeamMembership(
  status: string | null | undefined,
) {
  return status === "Active";
}

export function salonTeamInvitationActivationId(
  identity: CanonicalSalonIdentity | null | undefined,
  authenticatedEmail: string | null | undefined,
  memberships: Array<{ id?: string | null; status?: string | null }>,
) {
  // Salon owners use the same verified login flow but have no team invitation
  // to accept.
  if (identity?.primary_role !== "salon_team") return null;
  if (resolveSalonIdentityScope(identity, authenticatedEmail) !== "team") {
    throw new Error("This account requires administrator review.");
  }
  if (memberships.length !== 1) {
    throw new Error("This account requires administrator review.");
  }
  const membership = memberships[0];
  if (!membership?.id) {
    throw new Error("This account requires administrator review.");
  }
  if (membership.status === "Active") return null;
  if (membership.status === "Invited") return membership.id;
  throw new Error("This account requires administrator review.");
}
