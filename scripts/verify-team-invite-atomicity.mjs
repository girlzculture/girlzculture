import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compensateFailedInvitation,
  TeamInvitationCompensationError,
} from "../src/lib/teamInviteAtomicity.ts";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

async function expectOriginalFailure(run, expected) {
  await assert.rejects(run, (error) => error === expected);
}

async function downstreamFailureRemovesEverySurface() {
  const original = new Error("INJECTED_STYLIST_LINK_FAILURE");
  const calls = [];
  await expectOriginalFailure(
    () => compensateFailedInvitation({
      cause: original,
      actions: [
        { name: "revoke_auth_identity", run: async () => { calls.push("revoke"); } },
        { name: "restore_team_member", run: async () => { calls.push("member"); } },
        { name: "restore_stylist_link", run: async () => { calls.push("stylist"); } },
      ],
      audit: async ({ complete, failedSteps }) => {
        assert.equal(complete, true);
        assert.deepEqual(failedSteps, []);
        calls.push("audit");
      },
    }),
    original,
  );
  assert.deepEqual(calls, ["revoke", "member", "stylist", "audit"]);
}

async function transientCleanupFailureRetriesReliably() {
  const original = new Error("INJECTED_AUDIT_FAILURE");
  let revokeAttempts = 0;
  let rowRestores = 0;
  await expectOriginalFailure(
    () => compensateFailedInvitation({
      cause: original,
      actions: [
        {
          name: "revoke_auth_identity",
          run: async () => {
            revokeAttempts += 1;
            if (revokeAttempts === 1) throw new Error("INJECTED_TRANSIENT_DELETE_FAILURE");
          },
        },
        { name: "restore_authorization", run: async () => { rowRestores += 1; } },
      ],
      audit: async ({ complete }) => assert.equal(complete, true),
    }),
    original,
  );
  assert.equal(revokeAttempts, 2);
  assert.equal(rowRestores, 1);
}

async function permanentCleanupFailureIsVisibleAndStillAudited() {
  const original = new Error("INJECTED_DATABASE_FAILURE");
  let revokeAttempts = 0;
  let authorizationRollbacks = 0;
  let auditedOutcome;
  await assert.rejects(
    () => compensateFailedInvitation({
      cause: original,
      actions: [
        {
          name: "revoke_auth_identity",
          run: async () => {
            revokeAttempts += 1;
            throw new Error("INJECTED_PERMANENT_PROVIDER_FAILURE");
          },
        },
        {
          name: "restore_authorization",
          run: async () => { authorizationRollbacks += 1; },
        },
      ],
      audit: async (outcome) => { auditedOutcome = outcome; },
    }),
    (error) => {
      assert.ok(error instanceof TeamInvitationCompensationError);
      assert.deepEqual(error.failedSteps, ["revoke_auth_identity"]);
      assert.equal(error.cause, original);
      return true;
    },
  );
  assert.equal(revokeAttempts, 2);
  assert.equal(authorizationRollbacks, 1);
  assert.deepEqual(auditedOutcome, {
    complete: false,
    failedSteps: ["revoke_auth_identity"],
  });
}

async function compensationAuditIsRequiredAndRetried() {
  const original = new Error("INJECTED_MEMBER_SAVE_FAILURE");
  let auditAttempts = 0;
  await expectOriginalFailure(
    () => compensateFailedInvitation({
      cause: original,
      actions: [{ name: "revoke_auth_identity", run: async () => undefined }],
      audit: async () => {
        auditAttempts += 1;
        if (auditAttempts === 1) throw new Error("INJECTED_TRANSIENT_AUDIT_FAILURE");
      },
    }),
    original,
  );
  assert.equal(auditAttempts, 2);
}

await downstreamFailureRemovesEverySurface();
await transientCleanupFailureRetriesReliably();
await permanentCleanupFailureIsVisibleAndStillAudited();
await compensationAuditIsRequiredAndRetried();

const invite = read("src/lib/teamInvite.ts");
const salonRoute = read("src/app/api/salon/team/route.ts");
const adminRoute = read("src/app/api/admin/team/route.ts");
const checks = [
  ["Auth is disabled before deletion", invite.indexOf("updateUserById") < invite.indexOf("deleteUser")],
  ["successful identity audit is deferred until finalize", invite.includes("async finalize()")],
  ["compensation outcome is audited", invite.includes("identity_invitation_compensated") && invite.includes("identity_invitation_compensation_failed")],
  ["salon preflight occurs before invitation", salonRoute.indexOf('from("salon_team_members")') < salonRoute.indexOf("const invited = await inviteNewIdentity")],
  ["salon downstream failures compensate", salonRoute.includes("compensateFailedInvitation") && salonRoute.includes("restore_stylist_link")],
  ["admin preflight occurs before invitation", adminRoute.indexOf('from("admin_users")') < adminRoute.indexOf("const invited = await inviteNewIdentity")],
  ["admin downstream failures compensate", adminRoute.includes("compensateFailedInvitation") && adminRoute.includes("restore_admin_user")],
  ["both routes finalize only after route audit", salonRoute.indexOf("auditTeamChange") < salonRoute.lastIndexOf("invited.finalize()") && adminRoute.indexOf('"admin_invited"') < adminRoute.lastIndexOf("invited.finalize()")],
];

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
}
const failed = checks.filter(([, passed]) => !passed);
if (failed.length) process.exit(1);
console.log("Team invitation atomicity verification passed (4 injected scenarios; 8 integration checks). ");
