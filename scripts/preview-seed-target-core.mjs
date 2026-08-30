import { createHmac, timingSafeEqual } from "node:crypto";

export const PRODUCTION_SUPABASE_PROJECT_REF = "cuzfockthsqwubupskui";
export const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
export const PREVIEW_BRANCH_ATTESTATION_SCHEMA =
  "girlz-culture-preview-branch-attestation-v1";
export const PREVIEW_BRANCH_ATTESTATION_MAX_AGE_MS = 15 * 60 * 1_000;

const API_PROJECT_HOST_PATTERN = /^([a-z0-9]{20})\.supabase\.co$/;
const DIRECT_DATABASE_HOST_PATTERN = /^db\.([a-z0-9]{20})\.supabase\.co$/;
const POOLER_DATABASE_USER_PATTERN = /^postgres\.([a-z0-9]{20})$/;
const OFFICIAL_POOLER_HOST_PATTERN =
  /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const SECURE_DATABASE_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);
const HEALTHY_BRANCH_STATUSES = new Set([
  "MIGRATIONS_PASSED",
  "FUNCTIONS_DEPLOYED",
]);

export function isAllowedPreviewProjectRef(value) {
  const normalizedValue = String(value || "");
  return (
    SUPABASE_PROJECT_REF_PATTERN.test(normalizedValue) &&
    normalizedValue !== PRODUCTION_SUPABASE_PROJECT_REF
  );
}

export function apiProjectRefFromUrl(url) {
  return url.hostname.match(API_PROJECT_HOST_PATTERN)?.[1] || "";
}

export function databaseProjectRefFromUrl(url) {
  const directProjectRef = url.hostname.match(DIRECT_DATABASE_HOST_PATTERN)?.[1];
  if (
    directProjectRef &&
    url.port === "5432" &&
    decodeURIComponent(url.username) === "postgres"
  ) {
    return directProjectRef;
  }
  if (
    OFFICIAL_POOLER_HOST_PATTERN.test(url.hostname) &&
    ["5432", "6543"].includes(url.port)
  ) {
    return (
      decodeURIComponent(url.username).match(POOLER_DATABASE_USER_PATTERN)?.[1] ||
      ""
    );
  }
  return "";
}

export function requiredDatabaseSslMode(url) {
  const requestedMode = String(
    url.searchParams.has("sslmode")
      ? url.searchParams.get("sslmode")
      : "require",
  )
    .trim()
    .toLowerCase();
  return SECURE_DATABASE_SSL_MODES.has(requestedMode) ? requestedMode : "";
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function branchStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

/**
 * Accept only a healthy, disposable, schema-only branch whose authoritative
 * parent is the Girlz Culture production project. The database guard in the
 * seed independently proves that no production/private rows are present at
 * execution time; `with_data=false` proves the branch was not created from a
 * production-data clone.
 */
export function validatePreviewBranchMetadata(
  value,
  expectedProjectRef,
  expectedIdentity = {},
) {
  const branch = record(value);
  if (!branch) throw new Error("branch metadata is missing or malformed");
  if (
    !isAllowedPreviewProjectRef(expectedProjectRef) ||
    branch.project_ref !== expectedProjectRef
  ) {
    throw new Error("branch metadata does not match the requested preview ref");
  }
  if (branch.parent_project_ref !== PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("branch metadata has the wrong Girlz Culture parent project");
  }
  if (branch.is_default !== false) {
    throw new Error("the default Supabase branch cannot receive preview fixtures");
  }
  if (branch.persistent !== false) {
    throw new Error("a persistent Supabase branch cannot receive preview fixtures");
  }
  if (branch.with_data !== false) {
    throw new Error("a branch cloned with production data cannot receive preview fixtures");
  }
  if (branch.deletion_scheduled_at != null) {
    throw new Error("a branch scheduled for deletion cannot receive preview fixtures");
  }
  if (!HEALTHY_BRANCH_STATUSES.has(branchStatus(branch.status))) {
    throw new Error("the preview branch has not reached a terminal healthy status");
  }
  if (branchStatus(branch.preview_project_status) !== "ACTIVE_HEALTHY") {
    throw new Error("the preview branch services are not active and healthy");
  }
  if (
    !String(branch.id || "").trim() ||
    !String(branch.name || "").trim()
  ) {
    throw new Error("the preview branch identity is incomplete");
  }
  const gitBranch = String(branch.git_branch || "").trim();
  const expectedGitBranch = String(expectedIdentity.gitBranch || "").trim();
  if (!gitBranch || (expectedGitBranch && gitBranch !== expectedGitBranch)) {
    throw new Error("the preview branch does not match the expected Git branch");
  }
  const expectedBranchName = String(expectedIdentity.branchName || "").trim();
  if (expectedBranchName && branch.name !== expectedBranchName) {
    throw new Error("the preview branch does not match the expected branch name");
  }
  if (branch.pr_number != null) {
    const branchPrNumber = Number(branch.pr_number);
    if (!Number.isInteger(branchPrNumber) || branchPrNumber <= 0) {
      throw new Error("the preview branch pull-request association is malformed");
    }
  }
  if (expectedIdentity.prNumber != null) {
    const expectedPrNumber = Number(expectedIdentity.prNumber);
    if (
      !Number.isInteger(expectedPrNumber) ||
      expectedPrNumber <= 0 ||
      Number(branch.pr_number) !== expectedPrNumber
    ) {
      throw new Error("the preview branch does not match the expected pull request");
    }
  }
  return branch;
}

export function previewBranchFromManagementPayload(
  payload,
  expectedProjectRef,
  expectedIdentity = {},
) {
  const branches = Array.isArray(payload) ? payload : [payload];
  const matchingBranches = branches.filter(
    (candidate) => record(candidate)?.project_ref === expectedProjectRef,
  );
  if (matchingBranches.length !== 1) {
    throw new Error(
      "the requested preview ref is not uniquely present in Girlz Culture branch metadata",
    );
  }
  return validatePreviewBranchMetadata(
    matchingBranches[0],
    expectedProjectRef,
    expectedIdentity,
  );
}

function signatureBuffer(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized)
    ? Buffer.from(normalized, "hex")
    : null;
}

/**
 * Offline/CI callers may provide a short-lived snapshot of the Management API
 * response. It must be HMAC-signed by a secret stored outside the repository;
 * neither the secret nor signature is forwarded to psql or written to output.
 */
export function verifySignedPreviewBranchAttestation(
  rawAttestation,
  signature,
  secret,
  expectedProjectRef,
  now = Date.now(),
  expectedIdentity = {},
) {
  const suppliedSignature = signatureBuffer(signature);
  const secretValue = String(secret || "");
  if (!rawAttestation || !suppliedSignature || secretValue.length < 32) {
    throw new Error("the signed branch attestation is incomplete");
  }
  const expectedSignature = createHmac("sha256", secretValue)
    .update(String(rawAttestation), "utf8")
    .digest();
  if (
    expectedSignature.length !== suppliedSignature.length ||
    !timingSafeEqual(expectedSignature, suppliedSignature)
  ) {
    throw new Error("the signed branch attestation could not be verified");
  }

  let envelope;
  try {
    envelope = JSON.parse(String(rawAttestation));
  } catch {
    throw new Error("the signed branch attestation is not valid JSON");
  }
  if (
    !record(envelope) ||
    envelope.schema !== PREVIEW_BRANCH_ATTESTATION_SCHEMA ||
    !record(envelope.branch)
  ) {
    throw new Error("the signed branch attestation has the wrong schema");
  }
  const attestedAt = Date.parse(String(envelope.attested_at || ""));
  if (
    !Number.isFinite(attestedAt) ||
    attestedAt > now + 60_000 ||
    now - attestedAt > PREVIEW_BRANCH_ATTESTATION_MAX_AGE_MS
  ) {
    throw new Error("the signed branch attestation is stale or future-dated");
  }
  return validatePreviewBranchMetadata(
    envelope.branch,
    expectedProjectRef,
    expectedIdentity,
  );
}
