import assert from "node:assert/strict";
import test from "node:test";
import { verifyShardReports } from "../scripts/verify-browser-shard-results.mjs";
import { collectShardArtifacts, selectShardArtifacts } from "../scripts/collect-browser-shard-results.mjs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function fixture() {
  const shards = Array.from({ length: 8 }, (_, index) => ({
    summary: { shard: index + 1, shardCount: 8, workers: 1, code: 0, commit: "test-source" },
    report: { config: { workers: 1, shard: { current: index + 1, total: 8 }, projects: [{ retries: 0 }] }, errors: [],
      suites: [{ specs: [{ id: `test-${index}`, tests: [{ projectName: index % 2 ? "webkit" : "chromium", expectedStatus: "passed", status: "expected", results: [{ status: "passed", retry: 0 }] }] }] }] },
  }));
  const collection = { suites: shards.flatMap(shard => structuredClone(shard.report.suites)) };
  return { shards, collection, check: () => verifyShardReports(collection, shards, "test-source") };
}
test("accounts for the entire configured collection exactly once", () => {
  assert.deepEqual(fixture().check(), { passed: 8, skipped: 0, failed: 0, total: 8 });
});
for (const [name, corrupt] of [
  ["missing shard", f => f.shards.pop()],
  ["missing test", f => f.shards[0].report.suites.pop()],
  ["duplicate test", f => f.shards[1].report.suites = f.shards[0].report.suites],
  ["wrong source", f => f.shards[0].summary.commit = "another-source"],
  ["failed process", f => f.shards[0].summary.code = 1],
  ["global errors", f => f.shards[0].report.errors.push({ message: "browser crash" })],
  ["wrong shard", f => f.shards[0].report.config.shard.current = 2],
  ["multiple workers", f => f.shards[0].report.config.workers = 2],
  ["enabled retries", f => f.shards[0].report.config.projects[0].retries = 1],
  ["unexpected failure", f => f.shards[0].report.suites[0].specs[0].tests[0].status = "unexpected"],
  ["hidden expected failure", f => f.shards[0].report.suites[0].specs[0].tests[0].expectedStatus = "failed"],
  ["rerun result", f => f.shards[0].report.suites[0].specs[0].tests[0].results[0].retry = 1],
]) test(`rejects ${name}`, () => { const f = fixture(); corrupt(f); assert.throws(f.check); });
test("reports existing conditional skips distinctly from passing tests", () => {
  const f = fixture(); const item = f.shards[0].report.suites[0].specs[0].tests[0];
  item.status = "skipped"; item.expectedStatus = "skipped"; item.results[0].status = "skipped";
  assert.deepEqual(f.check(), { passed: 7, skipped: 1, failed: 0, total: 8 });
});

const artifactOptions = { prefix: "p0-browser-shard", runId: "12345", attempt: 2, commit: "test-source" };
const firstAttempt = Array.from({ length: 8 }, (_, i) => `p0-browser-shard-${i + 1}-12345-1`);
const partialRetry = [...firstAttempt, "p0-browser-shard-4-12345-2"];

test("partial job rerun retains seven successful siblings without nondeterministic overwrite", () => {
  // The previous workflow's current-attempt-only pattern loses seven shards.
  assert.throws(() => selectShardArtifacts(partialRetry.filter(name => name.endsWith("-2")), artifactOptions), /All eight shards/);
  const selected = selectShardArtifacts(partialRetry, artifactOptions);
  assert.deepEqual(selected.map(item => item.attempt), [1, 1, 1, 2, 1, 1, 1, 1]);
  assert.deepEqual(selectShardArtifacts([...partialRetry].reverse(), artifactOptions), selected);
});

test("first attempt selects all eight original results", () => {
  assert.deepEqual(selectShardArtifacts(firstAttempt, { ...artifactOptions, attempt: 1 }).map(item => item.attempt), Array(8).fill(1));
});

for (const [name, names] of [
  ["missing sibling", partialRetry.filter(name => !name.startsWith("p0-browser-shard-1-"))],
  ["wrong run", [...partialRetry, "p0-browser-shard-4-98765-2"]],
  ["future attempt", [...partialRetry, "p0-browser-shard-4-12345-3"]],
  ["unknown shard", [...partialRetry, "p0-browser-shard-9-12345-2"]],
  ["duplicate artifact", [...partialRetry, partialRetry[0]]],
  ["path traversal", [...partialRetry, "../p0-browser-shard-4-12345-2"]],
]) test(`artifact selection rejects ${name}`, () => assert.throws(() => selectShardArtifacts(names, artifactOptions)));

function artifactFixture(t, prefix = "p0-browser-shard") {
  const directory = mkdtempSync(path.join(tmpdir(), "gc-shard-artifacts-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, "artifacts");
  const output = path.join(directory, "selected");
  const options = { ...artifactOptions, prefix };
  function write(shard, attempt, mutate = () => {}) {
    const name = `${prefix}-${shard}-12345-${attempt}`;
    const reportDirectory = path.join(root, name, ...(prefix === "p0-browser-shard" ? ["playwright-shards"] : []));
    mkdirSync(reportDirectory, { recursive: true });
    const summary = { ...fixture().shards[shard - 1].summary, runId: "12345", runAttempt: attempt };
    mutate(summary);
    writeFileSync(path.join(reportDirectory, `shard-${shard}-summary.json`), JSON.stringify(summary));
    writeFileSync(path.join(reportDirectory, `shard-${shard}.json`), JSON.stringify(fixture().shards[shard - 1].report));
    writeFileSync(path.join(reportDirectory, `shard-${shard}.log`), `shard ${shard}, attempt ${attempt}`);
    return reportDirectory;
  }
  for (let shard = 1; shard <= 8; shard++) write(shard, 1);
  return { root, output, write, check: () => collectShardArtifacts(root, output, options) };
}

for (const prefix of ["browser-shard", "p0-browser-shard"]) test(`${prefix} combines a passing manual rerun with unchanged siblings and preserves originals`, t => {
  const f = artifactFixture(t, prefix);
  const failedDirectory = f.write(4, 1, summary => { summary.code = 1; });
  f.write(4, 2);
  assert.equal(f.check()[3].attempt, 2);
  assert.equal(JSON.parse(readFileSync(path.join(failedDirectory, "shard-4-summary.json"))).code, 1);
  assert.equal(readFileSync(path.join(f.output, "shard-4.log"), "utf8"), "shard 4, attempt 2");
  const shards = Array.from({ length: 8 }, (_, i) => ({
    summary: JSON.parse(readFileSync(path.join(f.output, `shard-${i + 1}-summary.json`))),
    report: JSON.parse(readFileSync(path.join(f.output, `shard-${i + 1}.json`))),
  }));
  assert.deepEqual(verifyShardReports(fixture().collection, shards, "test-source"), { passed: 8, skipped: 0, failed: 0, total: 8 });
});

for (const [name, mutate] of [
  ["latest failure despite earlier success", summary => { summary.code = 1; }],
  ["another source", summary => { summary.commit = "different-source"; }],
  ["another run", summary => { summary.runId = "99999"; }],
  ["misnamed attempt", summary => { summary.runAttempt = 1; }],
  ["misnamed shard", summary => { summary.shard = 3; }],
]) test(`collection rejects ${name} without publishing combined evidence`, t => {
  const f = artifactFixture(t); f.write(4, 2, mutate);
  assert.throws(f.check);
  assert.equal(existsSync(f.output), false);
});

test("a missing latest report cannot fall back to an earlier passing report", t => {
  const f = artifactFixture(t);
  rmSync(path.join(f.write(4, 2), "shard-4.json"));
  assert.throws(f.check);
  assert.equal(existsSync(f.output), false);
});
