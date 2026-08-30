import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  PREVIEW_BRANCH_ATTESTATION_SCHEMA,
  PRODUCTION_SUPABASE_PROJECT_REF,
  apiProjectRefFromUrl,
  databaseProjectRefFromUrl,
  isAllowedPreviewProjectRef,
  previewBranchFromManagementPayload,
  requiredDatabaseSslMode,
  validatePreviewBranchMetadata,
  verifySignedPreviewBranchAttestation,
} from "../../scripts/preview-seed-target-core.mjs";

const alphanumericProjectRef = "abc123def456ghi789jk";
const healthyBranch = Object.freeze({
  id: "12345678-1234-4123-8123-123456789abc",
  name: "pr-51-workstream-1",
  project_ref: alphanumericProjectRef,
  parent_project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
  is_default: false,
  persistent: false,
  with_data: false,
  git_branch: "codex/workstream-1-readability-accessibility",
  pr_number: 51,
  status: "FUNCTIONS_DEPLOYED",
  preview_project_status: "ACTIVE_HEALTHY",
});
const expectedIdentity = Object.freeze({
  gitBranch: "codex/workstream-1-readability-accessibility",
  branchName: "pr-51-workstream-1",
  prNumber: 51,
});

test("preview project references support Supabase alphanumeric references", () => {
  assert.equal(isAllowedPreviewProjectRef(alphanumericProjectRef), true);
  assert.equal(isAllowedPreviewProjectRef("abc123"), false);
  assert.equal(isAllowedPreviewProjectRef("ABC123DEF456GHI789JK"), false);
  assert.equal(isAllowedPreviewProjectRef(PRODUCTION_SUPABASE_PROJECT_REF), false);
});

test("preview target matching extracts the same alphanumeric reference from API and database URLs", () => {
  assert.equal(
    apiProjectRefFromUrl(
      new URL(`https://${alphanumericProjectRef}.supabase.co`),
    ),
    alphanumericProjectRef,
  );
  assert.equal(
    databaseProjectRefFromUrl(
      new URL(
        `postgresql://postgres:password@db.${alphanumericProjectRef}.supabase.co:5432/postgres`,
      ),
    ),
    alphanumericProjectRef,
  );
  assert.equal(
    databaseProjectRefFromUrl(
      new URL(
        `postgresql://postgres.${alphanumericProjectRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      ),
    ),
    alphanumericProjectRef,
  );
});

test("preview target matching rejects mismatched or malformed URL identities", () => {
  assert.equal(
    apiProjectRefFromUrl(new URL("https://example.test")),
    "",
  );
  assert.equal(
    databaseProjectRefFromUrl(
      new URL("postgresql://postgres:password@example.test:5432/postgres"),
    ),
    "",
  );
  assert.equal(
    databaseProjectRefFromUrl(
      new URL(
        `postgresql://postgres.${alphanumericProjectRef}:password@attacker.example:6543/postgres`,
      ),
    ),
    "",
  );
  assert.equal(
    databaseProjectRefFromUrl(
      new URL(
        `postgresql://postgres.${alphanumericProjectRef}:password@pooler.supabase.example:6543/postgres`,
      ),
    ),
    "",
  );
  assert.equal(
    databaseProjectRefFromUrl(
      new URL(
        `postgresql://postgres:password@db.${alphanumericProjectRef}.supabase.co:6543/postgres`,
      ),
    ),
    "",
  );
});

test("preview database connections require TLS and reject downgrade parameters", () => {
  const secureUrl = new URL(
    `postgresql://postgres.${alphanumericProjectRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  );
  assert.equal(requiredDatabaseSslMode(secureUrl), "require");
  secureUrl.searchParams.set("sslmode", "verify-full");
  assert.equal(requiredDatabaseSslMode(secureUrl), "verify-full");
  for (const unsafeMode of ["disable", "allow", "prefer", ""]) {
    secureUrl.searchParams.set("sslmode", unsafeMode);
    assert.equal(requiredDatabaseSslMode(secureUrl), "");
  }
});

test("authoritative branch metadata accepts only one healthy disposable Girlz Culture child", () => {
  assert.equal(
    previewBranchFromManagementPayload(
      [{ project_ref: "other123def456ghi789jk" }, healthyBranch],
      alphanumericProjectRef,
      expectedIdentity,
    ),
    healthyBranch,
  );
  assert.throws(
    () =>
      previewBranchFromManagementPayload(
        [healthyBranch, { ...healthyBranch }],
        alphanumericProjectRef,
        expectedIdentity,
      ),
    /not uniquely present/,
  );
});

test("authoritative branch metadata fails closed for unsafe branch states", () => {
  const unsafeStates = [
    ["parent_project_ref", "other123def456ghi789jk"],
    ["is_default", true],
    ["persistent", true],
    ["with_data", true],
    ["deletion_scheduled_at", "2026-08-29T12:00:00Z"],
    ["status", "MIGRATIONS_FAILED"],
    ["preview_project_status", "INACTIVE"],
    ["id", undefined],
    ["name", undefined],
    ["git_branch", undefined],
    ["pr_number", 0],
  ];
  for (const [property, value] of unsafeStates) {
    assert.throws(() =>
      validatePreviewBranchMetadata(
        { ...healthyBranch, [property]: value },
        alphanumericProjectRef,
        expectedIdentity,
      ),
    );
  }
  assert.throws(() =>
    validatePreviewBranchMetadata(
      { ...healthyBranch, project_ref: "other123def456ghi789jk" },
      alphanumericProjectRef,
      expectedIdentity,
    ),
  );
  assert.throws(() =>
    validatePreviewBranchMetadata(healthyBranch, alphanumericProjectRef, {
      ...expectedIdentity,
      gitBranch: "wrong-branch",
    }),
  );
  assert.doesNotThrow(() =>
    validatePreviewBranchMetadata(
      { ...healthyBranch, status: "MIGRATIONS_PASSED" },
      alphanumericProjectRef,
      expectedIdentity,
    ),
  );
});

test("short-lived signed branch attestations preserve authoritative metadata offline", () => {
  const now = Date.parse("2026-08-29T12:00:00.000Z");
  const secret = "unit-test-attestation-secret-that-is-long-enough";
  const rawAttestation = JSON.stringify({
    schema: PREVIEW_BRANCH_ATTESTATION_SCHEMA,
    attested_at: new Date(now).toISOString(),
    branch: healthyBranch,
  });
  const signature = createHmac("sha256", secret)
    .update(rawAttestation, "utf8")
    .digest("hex");

  assert.deepEqual(
    verifySignedPreviewBranchAttestation(
      rawAttestation,
      signature,
      secret,
      alphanumericProjectRef,
      now,
      expectedIdentity,
    ),
    healthyBranch,
  );
  assert.throws(
    () =>
      verifySignedPreviewBranchAttestation(
        rawAttestation,
        `${signature[0] === "0" ? "1" : "0"}${signature.slice(1)}`,
        secret,
        alphanumericProjectRef,
        now,
        expectedIdentity,
      ),
    /could not be verified/,
  );
  assert.throws(
    () =>
      verifySignedPreviewBranchAttestation(
        rawAttestation,
        signature,
        secret,
        alphanumericProjectRef,
        now + 16 * 60 * 1_000,
        expectedIdentity,
      ),
    /stale or future-dated/,
  );
});
