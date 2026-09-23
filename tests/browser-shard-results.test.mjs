import assert from "node:assert/strict";
import test from "node:test";
import { verifyShardReports } from "../scripts/verify-browser-shard-results.mjs";

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
