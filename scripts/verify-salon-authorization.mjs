import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isActiveSalonTeamMembership,
  resolveSalonIdentityScope,
  salonTeamInvitationActivationId,
} from "../src/lib/salonAuthorizationCore.ts";

const email = "owner@example.com";
const activeOwner = {
  email_normalized: email,
  primary_role: "salon_owner",
  status: "Active",
};
const activeTeam = {
  email_normalized: email,
  primary_role: "salon_team",
  status: "Active",
};

assert.equal(resolveSalonIdentityScope(activeOwner, email), "owner");
assert.equal(resolveSalonIdentityScope(activeTeam, email), "team");
assert.equal(
  resolveSalonIdentityScope({ ...activeOwner, status: "Disabled" }, email),
  null,
  "A disabled owner identity was authorized.",
);
assert.equal(
  resolveSalonIdentityScope({ ...activeTeam, status: "Disabled" }, email),
  null,
  "A disabled team identity was authorized.",
);
assert.equal(
  resolveSalonIdentityScope({ ...activeOwner, primary_role: "customer" }, email),
  null,
  "A mismatched customer identity was authorized for a salon.",
);
assert.equal(
  resolveSalonIdentityScope({ ...activeTeam, primary_role: "admin" }, email),
  null,
  "A mismatched admin identity was authorized for a salon.",
);
assert.equal(
  resolveSalonIdentityScope(activeOwner, "different@example.com"),
  null,
  "An identity whose canonical email does not match the authenticated user was authorized.",
);
assert.equal(resolveSalonIdentityScope(null, email), null);

assert.equal(isActiveSalonTeamMembership("Active"), true);
for (const status of ["Invited", "Inactive", "Suspended", "Revoked", null]) {
  assert.equal(
    isActiveSalonTeamMembership(status),
    false,
    `${String(status)} team membership was authorized.`,
  );
}

assert.equal(
  salonTeamInvitationActivationId(activeOwner, email, []),
  null,
  "A salon owner was treated as a pending team invitation.",
);
assert.equal(
  salonTeamInvitationActivationId(activeTeam, email, [
    { id: "membership-1", status: "Invited" },
  ]),
  "membership-1",
);
assert.equal(
  salonTeamInvitationActivationId(activeTeam, email, [
    { id: "membership-1", status: "Active" },
  ]),
  null,
  "An already-active team member was activated again.",
);
for (const memberships of [
  [],
  [
    { id: "membership-1", status: "Invited" },
    { id: "membership-2", status: "Invited" },
  ],
  [{ id: "membership-1", status: "Inactive" }],
]) {
  assert.throws(
    () => salonTeamInvitationActivationId(activeTeam, email, memberships),
    /administrator review/,
  );
}
assert.throws(
  () => salonTeamInvitationActivationId(activeTeam, "different@example.com", [
    { id: "membership-1", status: "Invited" },
  ]),
  /administrator review/,
);

const guard = readFileSync("src/lib/supabaseAdmin.ts", "utf8");
const destination = readFileSync("src/app/api/auth/destination/route.ts", "utf8");
const secureLogin = readFileSync("src/lib/secureLoginServer.ts", "utf8");
const loginVerify = readFileSync("src/app/api/auth/login/verify/route.ts", "utf8");
assert.match(guard, /from\("platform_identities"\)/);
assert.match(guard, /resolveSalonIdentityScope\(identity, user\.email\)/);
assert.match(guard, /if \(identityScope === "owner"\)/);
assert.match(guard, /\.eq\("status", "Active"\)/);
assert.doesNotMatch(guard, /\.in\("status", \["Invited", "Active"\]\)/);
assert.doesNotMatch(
  guard,
  /teamMember\.status === "Invited"[\s\S]{0,200}update\(\{ status: "Active"/,
);
assert.match(
  destination,
  /teamMember\.status !== "Active" \|\| resolveSalonIdentityScope\(identity, user\.email\) !== "team"/,
);
assert.match(
  destination,
  /resolveSalonIdentityScope\(identity, user\.email\) !== "owner"/,
);
assert.doesNotMatch(
  destination,
  /teamMember\.status === "Invited"[\s\S]{0,200}update\(\{ status: "Active"/,
);
assert.match(
  secureLogin,
  /activateVerifiedSalonTeamInvitation[\s\S]+primary_role !== "salon_team"[\s\S]+\.eq\("status", "Invited"\)/,
  "Accepted team invitations are not activated through the verified salon login ceremony.",
);
assert.match(
  loginVerify,
  /verifyMfaChallenge\([\s\S]+activateVerifiedSalonTeamInvitation\(auth\.user, role\)/,
  "Team invitation activation must happen only after the MFA challenge succeeds.",
);
assert.ok(
  loginVerify.indexOf("await verifyMfaChallenge(") <
    loginVerify.indexOf("await activateVerifiedSalonTeamInvitation(auth.user, role)"),
  "Team invitation activation occurred before MFA verification.",
);

console.log(
  "Salon authorization verification passed: only active canonical owner/team identities with matching authenticated email resolve; disabled, mismatched, missing, invited, and inactive identities or memberships are denied; destination lookup cannot activate invitations; and an accepted team invitation activates only after successful MFA.",
);
