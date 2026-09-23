import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function reportTests(report) {
  const tests = [];
  function visit(suite) {
    for (const spec of suite.specs || []) for (const test of spec.tests) {
      tests.push({ key: `${spec.id}:${test.projectName}`, ...test });
    }
    for (const child of suite.suites || []) visit(child);
  }
  visit(report);
  return tests;
}

export function verifyShardReports(collection, shards, commit) {
  assert.equal(shards.length, 8, "All eight shards must be present");
  const expected = reportTests(collection);
  const seen = new Set();
  const totals = { passed: 0, skipped: 0, failed: 0, total: expected.length };
  for (let i = 0; i < shards.length; i++) {
    const { report, summary } = shards[i];
    assert.equal(summary.shard, i + 1);
    assert.equal(summary.shardCount, 8);
    assert.equal(summary.workers, 1);
    assert.equal(summary.code, 0, `Shard ${i + 1} did not succeed`);
    assert.equal(summary.commit, commit, "Results must belong to this source commit");
    assert.equal(report.config.workers, 1);
    assert.deepEqual(report.config.shard, { current: i + 1, total: 8 });
    assert.equal(report.errors.length, 0, "Global browser errors are release failures");
    for (const project of report.config.projects) assert.equal(project.retries, 0);
    for (const test of reportTests(report)) {
      assert.ok(!seen.has(test.key), `Duplicate test: ${test.key}`);
      seen.add(test.key);
      assert.ok(["expected", "skipped"].includes(test.status), `Unsuccessful test: ${test.key}`);
      assert.ok(["passed", "skipped"].includes(test.expectedStatus), `Unexpected expected-failure annotation: ${test.key}`);
      assert.equal(test.results.length, 1, `Test must run exactly once: ${test.key}`);
      assert.equal(test.results[0].retry, 0);
      if (test.status === "skipped") { assert.equal(test.results[0].status, "skipped"); totals.skipped++; }
      else { assert.equal(test.results[0].status, "passed"); totals.passed++; }
    }
  }
  assert.deepEqual([...seen].sort(), expected.map(test => test.key).sort(), "Shards must cover the entire configured collection exactly once");
  return totals;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raw = execFileSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--list", "--reporter=json"], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: "" },
  });
  const read = name => JSON.parse(readFileSync(`playwright-shards/${name}`, "utf8"));
  const shards = Array.from({ length: 8 }, (_, i) => ({ report: read(`shard-${i + 1}.json`), summary: read(`shard-${i + 1}-summary.json`) }));
  const totals = verifyShardReports(JSON.parse(raw), shards, process.env.GITHUB_SHA || null);
  writeFileSync("playwright-shards/totals.json", JSON.stringify(totals, null, 2));
  console.log(`Full browser collection: ${totals.passed} passed, ${totals.skipped} skipped, ${totals.failed} failed; ${totals.total} accounted for exactly once.`);
}
