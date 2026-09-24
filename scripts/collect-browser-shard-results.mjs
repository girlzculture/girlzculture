import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// A manual job rerun increments the workflow attempt, but successful siblings
// retain their original artifacts. Never merge competing attempts over one
// another, fall back from a failed latest result, or discard those siblings.
export function selectShardArtifacts(names, { prefix, runId, attempt }) {
  assert.match(prefix, /^(?:p0-)?browser-shard$/);
  assert.match(String(runId), /^[1-9]\d*$/);
  assert.ok(Number.isSafeInteger(attempt) && attempt > 0);
  const selected = new Map();
  const seen = new Set();
  for (const name of names) {
    const match = new RegExp(`^${prefix}-([1-8])-${runId}-([1-9]\\d*)$`).exec(name);
    assert.ok(match, `Unexpected shard artifact: ${name}`);
    assert.ok(!seen.has(name), `Duplicate artifact: ${name}`);
    seen.add(name);
    const shard = Number(match[1]);
    const artifactAttempt = Number(match[2]);
    assert.ok(Number.isSafeInteger(artifactAttempt) && artifactAttempt <= attempt, "Artifact cannot come from a future attempt");
    if (!selected.has(shard) || selected.get(shard).attempt < artifactAttempt) {
      selected.set(shard, { name, shard, attempt: artifactAttempt });
    }
  }
  assert.equal(selected.size, 8, "All eight shards must be present, including successful earlier attempts");
  return [...selected.values()].sort((a, b) => a.shard - b.shard);
}

export function collectShardArtifacts(root, output, options) {
  const selected = selectShardArtifacts(readdirSync(root), options);
  const copies = [];
  for (const artifact of selected) {
    const directory = path.join(root, artifact.name);
    // The release artifact also contains screenshots, so its reports retain
    // their directory. The required workflow uploads only report files.
    const reports = options.prefix === "p0-browser-shard" ? path.join(directory, "playwright-shards") : directory;
    const summaryFile = `shard-${artifact.shard}-summary.json`;
    const summary = JSON.parse(readFileSync(path.join(reports, summaryFile), "utf8"));
    assert.equal(summary.runId, String(options.runId), "Artifact must belong to this workflow run");
    assert.equal(summary.runAttempt, artifact.attempt, "Artifact must belong to its named attempt");
    assert.equal(summary.shard, artifact.shard, "Artifact must belong to its named shard");
    assert.equal(summary.commit, options.commit, "Artifact must belong to this source commit");
    assert.equal(summary.code, 0, "The latest shard attempt must pass; earlier success cannot hide failure");
    for (const file of [summaryFile, `shard-${artifact.shard}.json`, `shard-${artifact.shard}.log`]) {
      // Read every selected file before writing any combined evidence.
      readFileSync(path.join(reports, file));
      copies.push([path.join(reports, file), path.join(output, file)]);
    }
  }
  mkdirSync(output, { recursive: true });
  for (const [source, target] of copies) copyFileSync(source, target);
  writeFileSync(path.join(output, "artifact-selection.json"), JSON.stringify(selected, null, 2));
  return selected;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const selected = collectShardArtifacts("browser-artifacts", "playwright-shards", {
    prefix: process.argv[2], runId: process.env.GITHUB_RUN_ID,
    attempt: Number(process.env.GITHUB_RUN_ATTEMPT), commit: process.env.GITHUB_SHA,
  });
  console.log(`Selected exact-run shard evidence: ${selected.map(item => `${item.shard}/8 attempt ${item.attempt}`).join(", ")}`);
}
