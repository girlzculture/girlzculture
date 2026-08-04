import { spawn } from "node:child_process";

const fixtureURL =
  process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL || "http://127.0.0.1:3105";
const siteURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3104";
const environment = {
  ...process.env,
  GIRLZ_CULTURE_ACCEPTANCE_MODE: "true",
  NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS: "true",
  NEXT_PUBLIC_SITE_URL: siteURL,
  NEXT_PUBLIC_SUPABASE_URL: fixtureURL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "acceptance-fixture-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "acceptance-fixture-service-role-key",
  PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL: fixtureURL,
};

function run(command, arguments_, options = {}) {
  return spawn(command, arguments_, {
    env: environment,
    stdio: "inherit",
    ...options,
  });
}

async function waitForFixture() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${fixtureURL}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // The fixture process may still be binding its local port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The browser acceptance Supabase fixture did not become ready.");
}

const fixture = run(process.execPath, [
  "scripts/start-acceptance-supabase-fixture.mjs",
]);

let exitCode = 1;
try {
  await waitForFixture();
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const build = run(npm, ["run", "build"]);
  exitCode = await new Promise((resolve, reject) => {
    build.once("error", reject);
    build.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  fixture.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => fixture.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}

process.exitCode = exitCode;
