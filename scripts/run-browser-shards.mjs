import { createWriteStream } from "node:fs";
import { mkdir as mkdirAsync } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const shardCount = Number(process.env.PLAYWRIGHT_BROWSER_SHARDS || 4);
const workers = Number(process.env.PLAYWRIGHT_SHARD_WORKERS || 1);
if (!Number.isInteger(shardCount) || shardCount < 2 || shardCount > 8 || !Number.isInteger(workers) || workers < 1 || workers > 4) {
  throw new Error("Invalid browser shard configuration");
}

const outputRoot = path.resolve("playwright-shards");
await mkdirAsync(outputRoot, { recursive: true });

function command() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function runShard(shard) {
  const basePort = 3104 + shard - 1;
  const fixturePort = 3105 + shard - 1;
  const resultDirectory = path.join(outputRoot, `shard-${shard}-results`);
  const logPath = path.join(outputRoot, `shard-${shard}.log`);
  const log = createWriteStream(logPath, { flags: "w" });
  const child = spawn(command(), [
    "--no-install", "playwright", "test",
    `--shard=${shard}/${shardCount}`,
    "--workers", String(workers),
    "--retries=0",
    "--reporter=list",
    "--output", resultDirectory,
  ], {
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${basePort}`,
      PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL: `http://127.0.0.1:${fixturePort}`,
      PLAYWRIGHT_CI_WORKERS: String(workers),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = `[browser shard ${shard}/${shardCount}] `;
  const forward = (stream, target) => stream.on("data", chunk => {
    const text = String(chunk);
    log.write(text);
    target.write(text.split("\n").map(line => line ? prefix + line : line).join("\n"));
  });
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  return new Promise(resolve => child.on("close", code => {
    log.end();
    resolve({ shard, code: code ?? 1, logPath });
  }));
}

const results = await Promise.all(Array.from({ length: shardCount }, (_, index) => runShard(index + 1)));
for (const result of results) process.stdout.write(`Browser shard ${result.shard}/${shardCount} exited ${result.code}; log ${result.logPath}\n`);
if (results.some(result => result.code !== 0)) process.exitCode = 1;
