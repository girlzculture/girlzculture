import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AdminTeamUpdateCompensationError,
  runCompensatedAdminTeamUpdate,
} from "../src/lib/adminTeamUpdateAtomicity.ts";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

function step(name, calls, { failApply = false, compensate } = {}) {
  return {
    name,
    apply: async () => {
      calls.push(`apply:${name}`);
      if (failApply) throw new Error(`INJECTED_${name.toUpperCase()}_FAILURE`);
    },
    compensate: async () => {
      calls.push(`compensate:${name}`);
      await compensate?.();
    },
  };
}

async function failureAtEveryForwardBoundaryRestoresInReverse() {
  for (const failedName of [
    "admin_user_record",
    "platform_identity",
    "auth_access",
    "security_audit",
  ]) {
    const calls = [];
    const original = new Error(`INJECTED_${failedName.toUpperCase()}_FAILURE`);
    const names = [
      "admin_user_record",
      "platform_identity",
      "auth_access",
      "security_audit",
    ];
    await assert.rejects(
      () => runCompensatedAdminTeamUpdate({
        steps: names.map((name) => ({
          name,
          apply: async () => {
            calls.push(`apply:${name}`);
            if (name === failedName) throw original;
          },
          compensate: async () => { calls.push(`compensate:${name}`); },
        })),
        auditCompensation: async (outcome) => {
          assert.deepEqual(outcome, { complete: true, failedSteps: [] });
          calls.push("audit:compensation");
        },
      }),
      (error) => error === original,
    );

    const failedIndex = names.indexOf(failedName);
    assert.deepEqual(calls, [
      ...names.slice(0, failedIndex + 1).map((name) => `apply:${name}`),
      ...names.slice(0, failedIndex).reverse().map((name) => `compensate:${name}`),
      "audit:compensation",
    ]);
  }
}

async function successfulUpdateDoesNotCompensate() {
  const calls = [];
  await runCompensatedAdminTeamUpdate({
    steps: [
      step("admin_user_record", calls),
      step("platform_identity", calls),
      step("auth_access", calls),
      step("security_audit", calls),
    ],
    auditCompensation: async () => { calls.push("audit:compensation"); },
  });
  assert.deepEqual(calls, [
    "apply:admin_user_record",
    "apply:platform_identity",
    "apply:auth_access",
    "apply:security_audit",
  ]);
}

async function transientCompensationFailureIsRetried() {
  const original = new Error("INJECTED_AUTH_FAILURE");
  const calls = [];
  let attempts = 0;
  await assert.rejects(
    () => runCompensatedAdminTeamUpdate({
      steps: [
        step("admin_user_record", calls, {
          compensate: async () => {
            attempts += 1;
            if (attempts === 1) throw new Error("INJECTED_TRANSIENT_RESTORE_FAILURE");
          },
        }),
        {
          name: "auth_access",
          apply: async () => { throw original; },
          compensate: async () => undefined,
        },
      ],
      auditCompensation: async (outcome) => {
        assert.deepEqual(outcome, { complete: true, failedSteps: [] });
      },
    }),
    (error) => error === original,
  );
  assert.equal(attempts, 2);
  assert.deepEqual(calls, [
    "apply:admin_user_record",
    "compensate:admin_user_record",
    "compensate:admin_user_record",
  ]);
}

async function permanentCompensationFailureIsSanitizedAndAudited() {
  const original = new Error("RAW_PROVIDER_ERROR_MUST_NOT_ESCAPE");
  let attempts = 0;
  let audited;
  await assert.rejects(
    () => runCompensatedAdminTeamUpdate({
      steps: [
        {
          name: "platform_identity",
          apply: async () => undefined,
          compensate: async () => {
            attempts += 1;
            throw new Error("RAW_DATABASE_ERROR_MUST_NOT_ESCAPE");
          },
        },
        {
          name: "auth_access",
          apply: async () => { throw original; },
          compensate: async () => undefined,
        },
      ],
      auditCompensation: async (outcome) => { audited = outcome; },
    }),
    (error) => {
      assert.ok(error instanceof AdminTeamUpdateCompensationError);
      assert.equal(error.code, "ADMIN_TEAM_UPDATE_COMPENSATION_FAILED");
      assert.deepEqual(error.failedSteps, ["platform_identity"]);
      assert.equal(error.cause, original);
      assert.doesNotMatch(error.message, /provider|database/i);
      return true;
    },
  );
  assert.equal(attempts, 2);
  assert.deepEqual(audited, {
    complete: false,
    failedSteps: ["platform_identity"],
  });
}

async function compensationAuditFailureIsRetriedAndVisible() {
  const original = new Error("INJECTED_FORWARD_FAILURE");
  let auditAttempts = 0;
  await assert.rejects(
    () => runCompensatedAdminTeamUpdate({
      steps: [{
        name: "admin_user_record",
        apply: async () => { throw original; },
        compensate: async () => undefined,
      }],
      auditCompensation: async () => {
        auditAttempts += 1;
        throw new Error("INJECTED_AUDIT_OUTAGE");
      },
    }),
    (error) => {
      assert.ok(error instanceof AdminTeamUpdateCompensationError);
      assert.deepEqual(error.failedSteps, ["compensation_audit"]);
      assert.equal(error.cause, original);
      return true;
    },
  );
  assert.equal(auditAttempts, 2);
}

await failureAtEveryForwardBoundaryRestoresInReverse();
await successfulUpdateDoesNotCompensate();
await transientCompensationFailureIsRetried();
await permanentCompensationFailureIsSanitizedAndAudited();
await compensationAuditFailureIsRetriedAndVisible();

const route = read("src/app/api/admin/team/route.ts");
const patch = route.slice(
  route.indexOf("async function applyCompensatedAdminUpdate"),
  route.indexOf("async function DELETEHandler"),
);
const adminStep = patch.indexOf('name: "admin_user_record"');
const identityStep = patch.indexOf('name: "platform_identity"');
const authStep = patch.indexOf('name: "auth_access"');
const auditStep = patch.indexOf('name: "security_audit"');

for (const [description, condition] of [
  ["provider and identity state are preflighted", patch.indexOf("getUserById") < adminStep && patch.indexOf('from("platform_identities")') < adminStep],
  ["forward updates are fail-closed and ordered", adminStep < identityStep && identityStep < authStep && authStep < auditStep],
  ["each authorization surface has compensation", (patch.match(/compensate: async/g) || []).length >= 4],
  ["compensation outcomes are durably audited", patch.includes("admin_update_compensated") && patch.includes("admin_update_compensation_failed")],
  ["unexpected failures use sanitized monitoring", patch.includes("return monitoredRouteFailure({") && patch.includes('provider: "supabase-auth"')],
  ["expected input and permission denials stay inline", patch.includes("isClearlyExpectedMessage(message)") && patch.includes("isPermissionDenialMessage(message)")],
]) {
  assert.ok(condition, description);
}

console.log(
  "Admin team update atomicity verification passed (4 forward-boundary injections, success, retry, permanent compensation, audit outage, and 6 integration contracts).",
);
