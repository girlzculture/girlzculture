import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import {
  MIGRATION_CONFIRMATION, MIGRATION_REPOSITORY, MIGRATION_WORKFLOW,
  REQUIRED_CI_STEPS, verifyProductionMigrationGate,
} from "../scripts/verify-production-migration-gate.mjs";

const sha = "a".repeat(40);
const env = {
  GITHUB_REPOSITORY: MIGRATION_REPOSITORY,
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  MIGRATION_CONFIRMATION,
  GITHUB_SHA: sha,
  GITHUB_WORKFLOW_SHA: sha,
  GITHUB_WORKFLOW_REF: `${MIGRATION_REPOSITORY}/${MIGRATION_WORKFLOW}@refs/heads/main`,
  GITHUB_TOKEN: "fixture-token-not-a-credential",
};
const run = {
  id: 448, run_number: 448, run_attempt: 1, event: "push", head_branch: "main", head_sha: sha,
  workflow_id: 123, repository: { full_name: MIGRATION_REPOSITORY }, head_repository: { full_name: MIGRATION_REPOSITORY },
  status: "completed", conclusion: "success",
};
function fixture() {
  const data = {
    ref: { ref: "refs/heads/main", object: { type: "commit", sha } },
    workflow: { id: 123, path: MIGRATION_WORKFLOW, state: "active" },
    runs: { total_count: 1, workflow_runs: [structuredClone(run)] },
    jobs: { total_count: 1, jobs: [{ name: "verify", head_sha: sha, status: "completed", conclusion: "success",
      steps: REQUIRED_CI_STEPS.map((name) => ({ name, status: "completed", conclusion: "success" })) }] },
    current: structuredClone(run),
  };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.equal(new URL(url).origin, "https://api.github.com");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, `Bearer ${env.GITHUB_TOKEN}`);
    let result;
    if (url.endsWith("/git/ref/heads/main")) result = data.ref;
    else if (url.endsWith("/actions/workflows/database-migrations.yml")) result = data.workflow;
    else if (url.includes("/actions/workflows/123/runs?")) {
      const query = new URL(url).searchParams;
      assert.equal(query.get("event"), "push");
      assert.equal(query.get("branch"), "main");
      assert.equal(query.get("head_sha"), sha);
      assert.equal(query.has("status"), false, "Do not filter away a newer failed or pending run.");
      result = data.runs;
    } else if (url.includes("/attempts/1/jobs?")) result = data.jobs;
    else if (url.endsWith("/actions/runs/448")) result = data.current;
    else throw new Error(`Unexpected fixture request: ${url}`);
    return { ok: true, status: 200, json: async () => structuredClone(result) };
  };
  return { data, calls, fetchImpl, check: (overrides = {}) => verifyProductionMigrationGate({ env, checkoutSha: sha, fetchImpl, ...overrides }) };
}

test("accepts exact main push success and checks its particular attempt, then rechecks main", async () => {
  const f = fixture();
  const result = await f.check();
  assert.deepEqual(result, { sha, runId: 448, runAttempt: 1, url: `https://github.com/${MIGRATION_REPOSITORY}/actions/runs/448` });
  assert.equal(f.calls.filter((url) => url.endsWith("/git/ref/heads/main")).length, 2);
  assert.ok(f.calls.some((url) => url.includes("/runs/448/attempts/1/jobs")));
});

for (const [field, value] of [
  ["GITHUB_REPOSITORY", "someone/fork"], ["GITHUB_EVENT_NAME", "push"],
  ["GITHUB_REF", "refs/heads/feature"], ["MIGRATION_CONFIRMATION", "APPLY REVIEWED MIGRATIONS "],
  ["GITHUB_SHA", "main"], ["GITHUB_WORKFLOW_SHA", "b".repeat(40)],
  ["GITHUB_WORKFLOW_REF", `${MIGRATION_REPOSITORY}/${MIGRATION_WORKFLOW}@refs/heads/feature`],
  ["GITHUB_TOKEN", ""],
]) {
  test(`rejects invalid ${field} before any network request`, async () => {
    const f = fixture();
    await assert.rejects(f.check({ env: { ...env, [field]: value } }));
    assert.equal(f.calls.length, 0);
  });
}
test("rejects a checkout that differs from the reviewed dispatch", async () => {
  const f = fixture();
  await assert.rejects(f.check({ checkoutSha: "b".repeat(40) }), /Checked-out source/);
  assert.equal(f.calls.length, 0);
});
test("rejects main moving before proof collection", async () => {
  const f = fixture();
  f.data.ref.object.sha = "b".repeat(40);
  await assert.rejects(f.check(), /Main has moved/);
});
test("rejects main moving while proof is collected", async () => {
  const f = fixture();
  await assert.rejects(f.check({ fetchImpl: async (url, options) => {
    if (url.endsWith("/git/ref/heads/main") && f.calls.length > 0) f.data.ref.object.sha = "b".repeat(40);
    return f.fetchImpl(url, options);
  } }), /Main has moved/);
});
test("ignores the later failed manual dispatch; a normal push is the evidence", async () => {
  const f = fixture();
  f.data.runs.workflow_runs.push({ ...run, id: 449, run_number: 449, event: "workflow_dispatch", conclusion: "failure" });
  f.data.runs.total_count++;
  assert.equal((await f.check()).runId, 448);
});
for (const [field, value] of [["event", "workflow_dispatch"], ["head_sha", "b".repeat(40)], ["head_branch", "feature"], ["workflow_id", 999], ["repository", { full_name: "someone/fork" }]]) {
  test(`rejects substitute CI evidence with different ${field}`, async () => {
    const f = fixture();
    f.data.runs.workflow_runs[0][field] = value;
    await assert.rejects(f.check(), /No normal main push CI/);
  });
}
for (const conclusion of ["failure", "cancelled", "skipped", null]) {
  test(`does not fall back to old success when newest push is ${conclusion}`, async () => {
    const f = fixture();
    f.data.runs.workflow_runs.push({ ...run, id: 450, run_number: 450, status: conclusion ? "completed" : "in_progress", conclusion });
    f.data.runs.total_count++;
    await assert.rejects(f.check(), /latest normal main push CI/);
  });
}
test("fails closed when the CI listing is truncated", async () => {
  const f = fixture();
  f.data.runs.total_count = 101;
  await assert.rejects(f.check(), /incomplete/);
});
test("rejects skipped verify job even if overall workflow succeeds", async () => {
  const f = fixture();
  f.data.jobs.jobs[0].conclusion = "skipped";
  await assert.rejects(f.check(), /verify job did not pass/);
});
test("rejects skipped browser coverage even if its job succeeds", async () => {
  const f = fixture();
  f.data.jobs.jobs[0].steps.at(-1).conclusion = "skipped";
  await assert.rejects(f.check(), /Required normal CI step did not pass/);
});
test("rejects a new CI attempt starting while evidence is collected", async () => {
  const f = fixture();
  f.data.current.run_attempt = 2;
  await assert.rejects(f.check(), /Normal CI changed/);
});
for (const status of [403, 404, 429, 500]) {
  test(`HTTP ${status} cannot bypass the prior-CI requirement`, async () => {
    const f = fixture();
    await assert.rejects(f.check({ fetchImpl: async () => ({ ok: false, status }) }), new RegExp(`HTTP ${status}`));
  });
}
test("network failure fails closed without echoing token or response data", async () => {
  const f = fixture();
  await assert.rejects(f.check({ fetchImpl: async () => { throw new Error(env.GITHUB_TOKEN); } }), (error) => {
    assert.match(error.message, /evidence is unavailable/);
    assert.ok(!error.message.includes(env.GITHUB_TOKEN));
    return true;
  });
});

test("workflow preserves normal browsers and gates every production command after local migration checks", () => {
  const yaml = createRequire(import.meta.url)("js-yaml");
  const workflow = yaml.load(readFileSync(new URL("../.github/workflows/database-migrations.yml", import.meta.url), "utf8"));
  assert.ok(Object.hasOwn(workflow.on, "pull_request"));
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  const { verify, "verify-migrations": migrations, migrate } = workflow.jobs;
  assert.equal(verify.if, "github.event_name != 'workflow_dispatch'");
  for (const name of REQUIRED_CI_STEPS) assert.equal(verify.steps.filter((step) => step.name === name).length, 1);
  assert.ok(verify.steps.some((step) => step.run === "npm run test:browser"));
  assert.ok(verify.steps.some((step) => step.run === "npm run test:accessibility"));
  const repeat = verify.steps.find((step) => step.name === "Repeat the exact WebKit business-card interaction twenty times");
  const onboarding = verify.steps.find((step) => step.name === "Exercise the complete business-onboarding spec on WebKit");
  assert.match(repeat.run, /--repeat-each=20/);
  assert.match(repeat.run, /--grep "business cards open the correct flow directly by pointer and keyboard"/);
  assert.doesNotMatch(onboarding.run, /--grep|--repeat-each/);
  for (const step of [repeat, onboarding]) {
    assert.match(step.run, /--config=playwright\.business-onboarding\.config\.ts/);
    assert.match(step.run, /--workers=1 --retries=0/);
    assert.ok(!step.if && !step["continue-on-error"]);
    assert.equal(step.env.PLAYWRIGHT_USE_PRODUCTION_SERVER, "true");
  }
  assert.equal(migrations.if, "github.event_name == 'workflow_dispatch'");
  assert.equal(migrate.needs, "verify-migrations");
  assert.equal(migrate.environment, "production-database");
  assert.equal(migrate.concurrency.group, "girlz-culture-production-database");
  assert.equal(migrate.concurrency["cancel-in-progress"], false);
  assert.match(migrate.if, /inputs.confirmation == 'APPLY REVIEWED MIGRATIONS'/);
  assert.match(migrate.if, /github.ref == 'refs\/heads\/main'/);
  for (const job of [migrations, migrate]) {
    assert.equal(job.permissions.contents, "read");
    assert.equal(job.permissions.actions, "read");
    assert.equal(job.steps[0].with.ref, "${{ github.sha }}");
    assert.equal(job.steps[0].with["persist-credentials"], false);
    assert.ok(job.steps.every((step) => !step["continue-on-error"] && !step.if));
    assert.doesNotMatch(job.steps.map((step) => step.run ?? "").join("\n"), /playwright|test:browser|test:accessibility|migration repair/);
  }
  const localCommands = migrations.steps.map((step) => step.run ?? "").join("\n");
  for (const command of ["verify:migrations", "verify:repository-metadata", "verify:database-clean", "verify-business-signup-migration.sql", "verify-production-migration-gate.mjs"]) assert.ok(localCommands.includes(command), command);
  assert.doesNotMatch(JSON.stringify(migrations), /secrets\.|supabase@/);
  const commands = migrate.steps.map((step) => step.run ?? "");
  const link = commands.findIndex((command) => command.includes("link --project-ref"));
  const list = commands.findIndex((command) => command.includes("migration list --linked"));
  const dryRun = commands.findIndex((command) => command.includes("db push --linked") && command.includes("--dry-run"));
  const apply = commands.findIndex((command) => command.includes("db push --linked") && !command.includes("--dry-run"));
  const proofs = commands.flatMap((command, i) => command.includes("verify-production-migration-gate.mjs") ? [i] : []);
  assert.ok(proofs.length === 2 && proofs[0] < link && link < list && list < dryRun && dryRun < proofs[1] && proofs[1] < apply);
  assert.ok(commands.slice(0, link).some((command) => command.includes("cuzfockthsqwubupskui")));
  assert.equal(migrate.env.SUPABASE_CLI_VERSION, "2.111.0");
});
