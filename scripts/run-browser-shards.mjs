import { createWriteStream } from "node:fs";
import { mkdir as mkdirAsync, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const shardCount = Number(process.env.PLAYWRIGHT_BROWSER_SHARDS || 8);
const workers = 1;
const shard = Number(process.env.PLAYWRIGHT_SHARD_INDEX);
if (shardCount !== 8 || !Number.isInteger(shard) || shard < 1 || shard > shardCount) {
  throw new Error("Invalid browser shard configuration");
}

const outputRoot = path.resolve("playwright-shards");
await mkdirAsync(outputRoot, { recursive: true });

const playwrightCLI = path.resolve("node_modules/@playwright/test/cli.js");

function streamOutput(stream, target, log, prefix) {
  stream.on("data", (chunk) => {
    const text = String(chunk);
    log.write(text);
    target.write(text.split("\n").map((line) => line ? prefix + line : line).join("\n"));
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

async function waitForFixture(fixtureURL) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${fixtureURL}/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The fixture may still be binding its assigned port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Acceptance fixture did not become ready at ${fixtureURL}.`);
}

function shardEnvironment(shard) {
  const basePort = 3104 + (shard - 1) * 2;
  const fixturePort = basePort + 1;
  return {
    appURL: `http://127.0.0.1:${basePort}`,
    fixtureURL: `http://127.0.0.1:${fixturePort}`,
    distDir: `playwright-shards/shard-${shard}-next`,
  };
}

function environmentForShard(config) {
  return {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: config.appURL,
    NEXT_PUBLIC_SUPABASE_URL: config.fixtureURL,
    PLAYWRIGHT_BASE_URL: config.appURL,
    PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL: config.fixtureURL,
    GIRLZ_CULTURE_BROWSER_DIST_DIR: config.distDir,
    PLAYWRIGHT_CI_WORKERS: String(workers),
    PLAYWRIGHT_USE_PRODUCTION_SERVER: "true",
    GIRLZ_CULTURE_ACCEPTANCE_MODE: "true",
    NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS: "true",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "acceptance-fixture-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "acceptance-fixture-service-role-key",
    CUSTOMER_MARKETPLACE_LIVE: "true",
    PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(outputRoot, `shard-${shard}.json`),
  };
}

async function buildShard(shard) {
  const config = shardEnvironment(shard);
  const logPath = path.join(outputRoot, `shard-${shard}.log`);
  const log = createWriteStream(logPath, { flags: "w" });
  const prefix = `[browser shard ${shard}/${shardCount} build] `;
  const environment = environmentForShard(config);
  const fixture = spawn(process.execPath, ["scripts/start-acceptance-supabase-fixture.mjs"], {
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const fixtureExit = waitForExit(fixture).catch(() => 1);
  streamOutput(fixture.stdout, process.stdout, log, prefix);
  streamOutput(fixture.stderr, process.stderr, log, prefix);
  try {
    await waitForFixture(config.fixtureURL);
    // Next 16 defaults `next build` to Turbopack. The acceptance build is a
    // deterministic production-artifact step, so use the repository's
    // Webpack path here instead of allowing Turbopack's CSS transform to vary
    // across isolated shard builds.
    const metadata = spawn(process.execPath, ["scripts/generate-repository-metadata.mjs"], { env: environment, stdio: "inherit" });
    if (await waitForExit(metadata) !== 0) throw new Error("Repository metadata generation failed.");
    const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    streamOutput(build.stdout, process.stdout, log, prefix);
    streamOutput(build.stderr, process.stderr, log, prefix);
    const code = await waitForExit(build);
    if (code !== 0) throw new Error(`Shard ${shard} acceptance build exited ${code}.`);
  } finally {
    fixture.kill("SIGTERM");
    await Promise.race([fixtureExit, new Promise((resolve) => setTimeout(resolve, 2_000))]);
    log.end();
  }
}

async function runShard(shard) {
  const config = shardEnvironment(shard);
  const resultDirectory = path.join(outputRoot, `shard-${shard}-results`);
  const logPath = path.join(outputRoot, `shard-${shard}.log`);
  const log = createWriteStream(logPath, { flags: "a" });
  const environment = environmentForShard(config);
  const child = spawn(process.execPath, [
    playwrightCLI, "test",
    `--shard=${shard}/${shardCount}`,
    "--workers", String(workers),
    "--retries=0",
    "--reporter=list,json",
    "--output", resultDirectory,
  ], {
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = `[browser shard ${shard}/${shardCount}] `;
  streamOutput(child.stdout, process.stdout, log, prefix);
  streamOutput(child.stderr, process.stderr, log, prefix);
  const code = await waitForExit(child).catch(() => 1);
  log.end();
  return { shard, code, logPath };
}

// One job owns exactly one build, fixture, app and browser worker. Separate
// hosted runners eliminate the serial-build delay and shared-runner contention.
await buildShard(shard);
const started = Date.now();
const result = await runShard(shard);
await writeFile(path.join(outputRoot, `shard-${shard}-summary.json`), JSON.stringify({
  ...result, shardCount, workers, elapsedMs: Date.now() - started,
  commit: process.env.GITHUB_SHA || null,
  runId: process.env.GITHUB_RUN_ID || null,
  runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
}));
process.stdout.write(`Browser shard ${shard}/${shardCount} exited ${result.code}; log ${result.logPath}\n`);
if (result.code !== 0) process.exitCode = result.code;
