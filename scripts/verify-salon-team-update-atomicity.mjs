import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compensateFailedTeamMutation,
  TeamMutationRollbackError,
} from "../src/lib/teamMutationAtomicity.ts";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

async function allTouchedSurfacesAreRestored() {
  const original = new Error("INJECTED_AUDIT_FAILURE");
  const calls = [];
  await assert.rejects(
    () => compensateFailedTeamMutation({
      cause: original,
      actions: [
        { name: "restore_team_member", run: async () => { calls.push("member"); } },
        { name: "restore_selected_stylist_link", run: async () => { calls.push("selected"); } },
        { name: "restore_previous_stylist_link", run: async () => { calls.push("previous"); } },
      ],
      audit: async (outcome) => {
        assert.deepEqual(outcome, { complete: true, failedSteps: [] });
        calls.push("audit");
      },
    }),
    (error) => error === original,
  );
  assert.deepEqual(calls, ["member", "selected", "previous", "audit"]);
}

async function transientSurfaceFailureIsRetried() {
  const original = new Error("INJECTED_NEW_STYLIST_LINK_FAILURE");
  let attempts = 0;
  await assert.rejects(
    () => compensateFailedTeamMutation({
      cause: original,
      actions: [{
        name: "restore_team_member",
        run: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("INJECTED_TRANSIENT_ROLLBACK_FAILURE");
        },
      }],
      audit: async ({ complete }) => assert.equal(complete, true),
    }),
    (error) => error === original,
  );
  assert.equal(attempts, 2);
}

async function permanentSurfaceFailureRemainsVisible() {
  const original = new Error("INJECTED_OLD_STYLIST_UNLINK_FAILURE");
  let otherSurfaceRestores = 0;
  let audited;
  await assert.rejects(
    () => compensateFailedTeamMutation({
      cause: original,
      actions: [
        {
          name: "restore_team_member",
          run: async () => { throw new Error("INJECTED_PERMANENT_ROLLBACK_FAILURE"); },
        },
        {
          name: "restore_previous_stylist_link",
          run: async () => { otherSurfaceRestores += 1; },
        },
      ],
      audit: async (outcome) => { audited = outcome; },
    }),
    (error) => {
      assert.ok(error instanceof TeamMutationRollbackError);
      assert.equal(error.cause, original);
      assert.deepEqual(error.failedSteps, ["restore_team_member"]);
      return true;
    },
  );
  assert.equal(otherSurfaceRestores, 1);
  assert.deepEqual(audited, {
    complete: false,
    failedSteps: ["restore_team_member"],
  });
}

async function rollbackAuditIsRequiredAndRetried() {
  const original = new Error("INJECTED_MEMBER_UPDATE_FAILURE");
  let auditAttempts = 0;
  await assert.rejects(
    () => compensateFailedTeamMutation({
      cause: original,
      actions: [{ name: "restore_team_member", run: async () => undefined }],
      audit: async () => {
        auditAttempts += 1;
        if (auditAttempts === 1) throw new Error("INJECTED_TRANSIENT_AUDIT_FAILURE");
      },
    }),
    (error) => error === original,
  );
  assert.equal(auditAttempts, 2);
}

await allTouchedSurfacesAreRestored();
await transientSurfaceFailureIsRetried();
await permanentSurfaceFailureRemainsVisible();
await rollbackAuditIsRequiredAndRetried();

const route = read("src/app/api/salon/team/route.ts");
const patch = route.slice(
  route.indexOf("async function PATCHHandler"),
  route.indexOf("async function DELETEHandler"),
);
const updateIndex = patch.indexOf('.from("salon_team_members").update(changes)');
assert.ok(updateIndex > 0, "Salon team edit mutation is missing.");
assert.ok(
  patch.indexOf('.select("id,user_id")') < updateIndex,
  "Both stylist link snapshots must be loaded before the member mutation.",
);
for (const contract of [
  "compensateFailedTeamMutation",
  "restore_team_member",
  "restore_selected_stylist_link",
  "restore_previous_stylist_link",
  "rollback_complete",
  "Failed salon team member update automatically rolled back",
]) {
  assert.ok(patch.includes(contract), `Salon team update rollback contract is missing: ${contract}`);
}
assert.match(
  patch,
  /await auditTeamChange[\s\S]*return Response\.json\(\{ user: data \}\)/,
  "A successful team edit must be audited before the response is returned.",
);
assert.match(
  patch,
  /const \{ admin, salon, user \} = await owner\(request\)/,
  "The owner-only authorization boundary changed.",
);

console.log(
  "Salon team update atomicity verification passed (4 injected rollback scenarios and owner/link/audit integration contracts).",
);
