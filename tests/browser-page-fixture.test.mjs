import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("page setup has its own deadline without extending the interaction deadline", () => {
  const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const prefix = join(tmpdir(), "girlz-page-fixture-budget-");
  const directory = mkdtempSync(prefix);
  const reportPath = join(directory, "report.json");
  const playwright = resolve(repository, "node_modules/@playwright/test").replaceAll("\\", "/");
  const helper = resolve(repository, "tests/browser/helpers/page.ts").replaceAll("\\", "/");
  const configPath = join(directory, "playwright.config.mjs");
  // This is a runner/fixture lifecycle regression, not a mocked application test.
  // Artificial page creation exceeds the test deadline. Only the setup clock
  // should absorb it; deliberately slow interaction must still time out.
  const spec = [
    "import { test as base, expect } from " + JSON.stringify(playwright) + ";",
    "import { test as isolated } from " + JSON.stringify(helper) + ";",
    "const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));",
    "const delayedContext = async ({}, use: (value: unknown) => Promise<void>) => {",
    "  await use({ newPage: async () => { await pause(1500); return { ready: true }; } });",
    "};",
    "const original = base.extend({ context: delayedContext });",
    "const corrected = isolated.extend({ context: delayedContext });",
    "original('shared setup consumes the interaction deadline', async ({ page }) => {",
    "  expect(page).toBeTruthy();",
    "});",
    "corrected('isolated setup leaves the interaction deadline intact', async ({ page }, testInfo) => {",
    "  expect(page).toEqual({ ready: true });",
    "  expect(testInfo.timeout).toBe(1000);",
    "});",
    "corrected('slow interaction still exceeds the unchanged deadline', async ({ page }) => {",
    "  expect(page).toBeTruthy();",
    "  await pause(1500);",
    "});",
  ].join("\n");
  writeFileSync(join(directory, "budget.spec.ts"), spec);
  writeFileSync(configPath, "export default " + JSON.stringify({
    testDir: directory,
    timeout: 1000,
    retries: 0,
    workers: 1,
    fullyParallel: false,
    reporter: [["json", { outputFile: reportPath }]],
  }) + ";\n");
  try {
    const run = spawnSync(process.execPath, [
      resolve(repository, "node_modules/@playwright/test/cli.js"),
      "test", "--config", configPath,
    ], { cwd: repository, encoding: "utf8", timeout: 45_000, windowsHide: true });
    assert.equal(run.error, undefined, run.error?.message);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const specs = [];
    const collect = suite => {
      specs.push(...(suite.specs || []));
      for (const child of suite.suites || []) collect(child);
    };
    for (const suite of report.suites) collect(suite);
    const outcomes = Object.fromEntries(specs.map(spec => [
      spec.title, spec.tests[0].results.map(result => result.status),
    ]));
    assert.deepEqual(outcomes, {
      "shared setup consumes the interaction deadline": ["timedOut"],
      "isolated setup leaves the interaction deadline intact": ["passed"],
      "slow interaction still exceeds the unchanged deadline": ["timedOut"],
    }, JSON.stringify(report.errors || []) + run.stderr);
    assert.equal(run.status, 1, "Both intentional deadline failures must remain failures");
  } finally {
    // Only remove the fresh, uniquely named directory created by this test.
    assert(resolve(directory).startsWith(resolve(prefix)));
    rmSync(directory, { recursive: true, force: true });
  }
});
