import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const port = Number(process.env.MEDIA_RUNTIME_TEST_PORT || 3202);
const origin = `http://127.0.0.1:${port}`;
const nextBin = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let output = "";
for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-8_000);
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithTimeout(url, init = {}, milliseconds = 5_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), milliseconds);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitUntilReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before it was ready.\n${output}`);
    }
    try {
      const response = await fetchWithTimeout(`${origin}/api/media/upload`);
      if (response.status > 0) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Next.js did not become ready within 30 seconds.\n${output}`);
}

const cases = [
  {
    name: "prepare malformed JSON",
    path: "/api/media/upload/prepare",
    method: "POST",
    body: "{bad",
    status: 400,
  },
  {
    name: "finalize malformed JSON",
    path: "/api/media/upload/finalize",
    method: "POST",
    body: "{bad",
    status: 400,
  },
  {
    name: "finalize invalid upload ID",
    path: "/api/media/upload/finalize",
    method: "POST",
    body: JSON.stringify({ upload_id: "bad" }),
    status: 400,
  },
  {
    name: "retired binary upload",
    path: "/api/media/upload",
    method: "POST",
    body: "{}",
    status: 410,
  },
  {
    name: "missing placement profile",
    path: "/api/media/upload",
    method: "GET",
    status: 400,
  },
];

try {
  await waitUntilReady();
  for (const testCase of cases) {
    const response = await fetchWithTimeout(`${origin}${testCase.path}`, {
      method: testCase.method,
      headers: testCase.body
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: "application/json" },
      body: testCase.body,
    });
    const contentType = response.headers.get("content-type") || "";
    assert.equal(
      response.status,
      testCase.status,
      `${testCase.name} returned ${response.status}`,
    );
    assert.match(
      contentType,
      /application\/json/i,
      `${testCase.name} did not return JSON`,
    );
    const payload = await response.json();
    assert.equal(
      typeof payload.error,
      "string",
      `${testCase.name} did not return a safe inline error`,
    );
    assert.equal(
      "request_id" in payload,
      false,
      `${testCase.name} incorrectly created an operational incident`,
    );
  }
  console.log(
    "Verified production-runtime media validation returns bounded JSON 4xx responses without false Engine references.",
  );
} finally {
  if (server.exitCode === null) server.kill();
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    delay(5_000),
  ]);
}
