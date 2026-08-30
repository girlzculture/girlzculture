import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  apiProjectRefFromUrl,
  databaseProjectRefFromUrl,
  isAllowedPreviewProjectRef,
  previewBranchFromManagementPayload,
  requiredDatabaseSslMode,
  verifySignedPreviewBranchAttestation,
} from "./preview-seed-target-core.mjs";

const root = process.cwd();
const seedFile = path.join(root, "supabase", "seed.preview.sql");
const assertionFile = path.join(root, "scripts", "sql", "verify-preview-seed.sql");
const psql = process.env.PSQL_BIN || "psql";
const databaseUrl = process.env.PREVIEW_DATABASE_URL || "";
const supabaseUrl = process.env.PREVIEW_SUPABASE_URL || "";
const projectRef = (process.env.PREVIEW_SUPABASE_PROJECT_REF || "").trim();
const confirmation = process.env.PREVIEW_SEED_CONFIRMATION || "";
const managementToken = process.env.SUPABASE_ACCESS_TOKEN || "";
const signedAttestation =
  process.env.PREVIEW_SUPABASE_BRANCH_ATTESTATION_JSON || "";
const attestationSignature =
  process.env.PREVIEW_SUPABASE_BRANCH_ATTESTATION_SIGNATURE || "";
const attestationSecret =
  process.env.PREVIEW_SUPABASE_BRANCH_ATTESTATION_SECRET || "";

function refuse(message) {
  console.error(`Preview seed refused: ${message}`);
  process.exit(1);
}

if (!existsSync(seedFile) || !existsSync(assertionFile)) {
  refuse("the repository seed or its database assertions are missing.");
}
if (!databaseUrl || !supabaseUrl || !projectRef) {
  refuse(
    "PREVIEW_DATABASE_URL, PREVIEW_SUPABASE_URL, and PREVIEW_SUPABASE_PROJECT_REF are all required.",
  );
}
if (confirmation !== "girlz-culture-pr-preview-only") {
  refuse("PREVIEW_SEED_CONFIRMATION does not contain the exact preview phrase.");
}
if (!isAllowedPreviewProjectRef(projectRef)) {
  refuse("the declared project reference is invalid or is the production project.");
}
if (
  [
    process.env.CONTEXT,
    process.env.DEPLOY_CONTEXT,
    process.env.NETLIFY_CONTEXT,
    process.env.VERCEL_ENV,
  ].some((value) => String(value || "").toLowerCase() === "production")
) {
  refuse("a production deployment context is active.");
}

function repositoryGitBranch() {
  const environmentBranch = [
    process.env.PREVIEW_GIT_BRANCH,
    process.env.GITHUB_HEAD_REF,
    process.env.BRANCH,
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (environmentBranch) return environmentBranch;
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? String(result.stdout || "").trim() : "";
}

const expectedGitBranch = repositoryGitBranch();
if (!expectedGitBranch) {
  refuse("the expected Git branch identity is unavailable.");
}
const expectedBranchName = String(
  process.env.PREVIEW_SUPABASE_BRANCH_NAME || "",
).trim();
const pullRequestValue = String(
  process.env.PREVIEW_PULL_REQUEST_NUMBER || process.env.REVIEW_ID || "",
).trim();
if (pullRequestValue && !/^[1-9]\d*$/.test(pullRequestValue)) {
  refuse("the expected pull-request association is malformed.");
}
const expectedBranchIdentity = {
  gitBranch: expectedGitBranch,
  ...(expectedBranchName ? { branchName: expectedBranchName } : {}),
  ...(pullRequestValue ? { prNumber: Number(pullRequestValue) } : {}),
};

let parsedDatabase;
let parsedSupabase;
try {
  parsedDatabase = new URL(databaseUrl);
  parsedSupabase = new URL(supabaseUrl);
} catch {
  refuse("a supplied URL is malformed.");
}

const apiRef = apiProjectRefFromUrl(parsedSupabase);
const databaseRef = databaseProjectRefFromUrl(parsedDatabase);
const databaseSslMode = requiredDatabaseSslMode(parsedDatabase);
if (
  parsedSupabase.protocol !== "https:" ||
  !["postgres:", "postgresql:"].includes(parsedDatabase.protocol) ||
  !apiRef ||
  !databaseRef ||
  !databaseSslMode ||
  apiRef !== projectRef ||
  databaseRef !== projectRef
) {
  refuse(
    "the API URL, official TLS-protected database target, and declared preview project do not match.",
  );
}

async function loadAuthoritativeBranchMetadata() {
  if (managementToken) {
    let response;
    try {
      response = await fetch(
        `https://api.supabase.com/v1/projects/${PRODUCTION_SUPABASE_PROJECT_REF}/branches`,
        {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${managementToken}`,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch {
      throw new Error("the Supabase Management API could not be reached");
    }
    if (!response.ok) {
      throw new Error(
        `the Supabase Management API returned HTTP ${response.status}`,
      );
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("the Supabase Management API returned malformed metadata");
    }
    previewBranchFromManagementPayload(
      payload,
      projectRef,
      expectedBranchIdentity,
    );
    return "supabase-management-api";
  }

  verifySignedPreviewBranchAttestation(
    signedAttestation,
    attestationSignature,
    attestationSecret,
    projectRef,
    Date.now(),
    expectedBranchIdentity,
  );
  return "signed-management-attestation";
}

let attestationSource;
try {
  attestationSource = await loadAuthoritativeBranchMetadata();
} catch (error) {
  refuse(
    error instanceof Error
      ? `authoritative branch attestation failed: ${error.message}.`
      : "authoritative branch attestation failed.",
  );
}

function sanitizedOutput(value) {
  return String(value || "")
    .replaceAll(databaseUrl, "[REDACTED_DATABASE_URL]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .trim();
}

function runPsql(args, label) {
  // Give psql only process-launch essentials and its database connection.
  // Application/provider credentials (including Management API attestation
  // material) are intentionally not inherited by the database subprocess.
  const safeEnvironment = Object.fromEntries(
    ["PATH", "Path", "PATHEXT", "SystemRoot", "TEMP", "TMP", "LANG"].flatMap(
      (name) => (process.env[name] ? [[name, process.env[name]]] : []),
    ),
  );
  const result = spawnSync(
    psql,
    ["-X", "--set", "ON_ERROR_STOP=1", ...args],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...safeEnvironment,
        PGHOST: parsedDatabase.hostname,
        PGPORT: parsedDatabase.port || "5432",
        PGUSER: decodeURIComponent(parsedDatabase.username),
        PGPASSWORD: decodeURIComponent(parsedDatabase.password),
        PGDATABASE:
          decodeURIComponent(parsedDatabase.pathname.replace(/^\//, "")) ||
          "postgres",
        PGSSLMODE: databaseSslMode,
        PGCONNECT_TIMEOUT: "15",
      },
    },
  );
  if (result.status !== 0) {
    console.error(`${label} failed without exposing database credentials.`);
    const safeError = sanitizedOutput(result.stderr || result.stdout);
    if (safeError) console.error(safeError);
    process.exit(result.status ?? 1);
  }
  return sanitizedOutput(result.stdout);
}

runPsql(
  [
    "--single-transaction",
    "--command",
    [
      "set local girlzculture.preview_seed_authorized='true'",
      "set local app.preview_seed_enabled='true'",
      "set local app.preview_seed_environment='preview'",
      `set local app.preview_seed_project_ref='${projectRef}'`,
      "set local app.preview_seed_confirmation='girlz-culture-pr-preview-only'",
      "set local app.preview_seed_branch_attested='true'",
      `set local app.preview_seed_attestation_source='${attestationSource}'`,
      `set local app.preview_seed_parent_project_ref='${PRODUCTION_SUPABASE_PROJECT_REF}'`,
      "set local app.preview_seed_branch_is_default='false'",
      "set local app.preview_seed_branch_persistent='false'",
      "set local app.preview_seed_branch_with_data='false'",
    ].join("; ") + ";",
    "--file",
    seedFile,
    "--file",
    assertionFile,
  ],
  "Atomic preview seed and verification",
);
process.stdout.write(
  `Preview seed applied and verified for non-production project ${projectRef}.\n`,
);
