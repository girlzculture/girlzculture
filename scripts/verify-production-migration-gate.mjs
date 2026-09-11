import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MIGRATION_REPOSITORY = "girlzculture/girlzculture";
export const MIGRATION_WORKFLOW = ".github/workflows/database-migrations.yml";
export const MIGRATION_CONFIRMATION = "APPLY REVIEWED MIGRATIONS";
export const REQUIRED_CI_STEPS = [
  "Require secure full and production dependency trees",
  "Execute the complete migration chain from an empty database",
  "Exercise focused Workstream 1 accessibility and contrast workflows",
  "Exercise responsive and affected browser workflows",
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function verifyDispatchContext(env, checkoutSha) {
  requireCondition(env.GITHUB_REPOSITORY === MIGRATION_REPOSITORY, "Production migrations require the canonical repository.");
  requireCondition(env.GITHUB_EVENT_NAME === "workflow_dispatch", "Production migrations require a manual dispatch.");
  requireCondition(env.GITHUB_REF === "refs/heads/main", "Production migrations require main.");
  requireCondition(env.MIGRATION_CONFIRMATION === MIGRATION_CONFIRMATION, "Founder confirmation must be APPLY REVIEWED MIGRATIONS.");
  requireCondition(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? ""), "The dispatch commit SHA is missing or invalid.");
  requireCondition(checkoutSha === env.GITHUB_SHA, "Checked-out source differs from the dispatch commit.");
  requireCondition(env.GITHUB_WORKFLOW_SHA === env.GITHUB_SHA, "Workflow source differs from the dispatch commit.");
  requireCondition(env.GITHUB_WORKFLOW_REF === `${MIGRATION_REPOSITORY}/${MIGRATION_WORKFLOW}@refs/heads/main`, "The dispatch must use the canonical migration workflow on main.");
  requireCondition(Boolean(env.GITHUB_TOKEN), "A read-only GitHub token is required to verify prior CI.");
  return env.GITHUB_SHA;
}

function verifyCollection(payload, key) {
  requireCondition(Array.isArray(payload?.[key]) && Number.isSafeInteger(payload.total_count), `GitHub returned invalid ${key} evidence.`);
  // An incomplete listing must never select an older success over a newer failure.
  requireCondition(payload.total_count === payload[key].length, `GitHub ${key} evidence is incomplete; refusing to infer success.`);
  return payload[key];
}

function isExactPush(run, sha, workflowId) {
  return run?.event === "push" && run.head_branch === "main" && run.head_sha === sha
    && run.workflow_id === workflowId && run.repository?.full_name === MIGRATION_REPOSITORY
    && run.head_repository?.full_name === MIGRATION_REPOSITORY;
}

function verifySuccessfulRun(run) {
  requireCondition(Number.isSafeInteger(run?.id) && run.id > 0 && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, "Prior CI run identity is invalid.");
  requireCondition(run.status === "completed" && run.conclusion === "success", "The latest normal main push CI for this exact commit has not passed.");
}

/** Read-only proof. The token is sent only to api.github.com and never printed. */
export async function verifyProductionMigrationGate({ env, checkoutSha, fetchImpl = fetch }) {
  const sha = verifyDispatchContext(env, checkoutSha);
  const base = `https://api.github.com/repos/${MIGRATION_REPOSITORY}`;
  async function get(path) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("GitHub CI evidence is unavailable; refusing production migration.");
    }
    requireCondition(response.ok, `GitHub CI evidence request failed (HTTP ${response.status}); refusing production migration.`);
    try { return await response.json(); } catch { throw new Error("GitHub CI evidence is not valid JSON."); }
  }
  async function requireCurrentMain() {
    const ref = await get("/git/ref/heads/main");
    requireCondition(ref?.ref === "refs/heads/main" && ref.object?.type === "commit" && ref.object.sha === sha, "Main has moved since dispatch; review and dispatch its new commit after normal CI passes.");
  }
  await requireCurrentMain();
  const workflow = await get("/actions/workflows/database-migrations.yml");
  requireCondition(Number.isSafeInteger(workflow?.id) && workflow.path === MIGRATION_WORKFLOW && workflow.state === "active", "The canonical normal CI workflow is unavailable.");
  const query = new URLSearchParams({ event: "push", branch: "main", head_sha: sha, per_page: "100" });
  const runs = verifyCollection(await get(`/actions/workflows/${workflow.id}/runs?${query}`), "workflow_runs")
    .filter((run) => isExactPush(run, sha, workflow.id));
  requireCondition(runs.length > 0, "No normal main push CI exists for this exact commit. PR or manual runs cannot substitute.");
  requireCondition(runs.every((run) => Number.isSafeInteger(run.run_number) && run.run_number > 0), "Prior CI run ordering is invalid.");
  const run = runs.sort((a, b) => b.run_number - a.run_number)[0];
  verifySuccessfulRun(run);
  const jobs = verifyCollection(await get(`/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`), "jobs");
  const verifyJobs = jobs.filter((job) => job.name === "verify");
  requireCondition(verifyJobs.length === 1, "The normal CI verify job is missing or ambiguous.");
  const job = verifyJobs[0];
  requireCondition(job.head_sha === sha && job.status === "completed" && job.conclusion === "success", "The exact-commit normal CI verify job did not pass.");
  for (const name of REQUIRED_CI_STEPS) {
    const steps = Array.isArray(job.steps) ? job.steps.filter((step) => step.name === name) : [];
    requireCondition(steps.length === 1 && steps[0].status === "completed" && steps[0].conclusion === "success", `Required normal CI step did not pass: ${name}.`);
  }
  // A rerun or a new main commit during proof collection invalidates the evidence.
  const current = await get(`/actions/runs/${run.id}`);
  requireCondition(isExactPush(current, sha, workflow.id) && current.run_attempt === run.run_attempt, "Normal CI changed during verification.");
  verifySuccessfulRun(current);
  await requireCurrentMain();
  return { sha, runId: run.id, runAttempt: run.run_attempt, url: `https://github.com/${MIGRATION_REPOSITORY}/actions/runs/${run.id}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const proof = await verifyProductionMigrationGate({ env: process.env, checkoutSha });
    const message = `Exact main commit ${proof.sha} passed normal CI: ${proof.url} (attempt ${proof.runAttempt}).`;
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  } catch (error) {
    console.error(`Production migration gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}
