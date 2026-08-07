import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = String(process.env.GITHUB_REPOSITORY || "");
const pullRequestNumber = String(process.env.PULL_REQUEST_NUMBER || "");
const expectedHeadSha = String(process.env.PULL_REQUEST_HEAD_SHA || "");
const githubToken = String(process.env.GITHUB_TOKEN || "");

if (!repository || !pullRequestNumber || !expectedHeadSha || !githubToken) {
  throw new Error(
    "GitHub repository, pull request, head SHA, and token are required for Netlify preview readiness.",
  );
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${githubToken}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "Girlz-Culture-Preview-Acceptance",
};

async function githubJson(url) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned HTTP ${response.status} for ${url}.`);
  }
  return response.json();
}

function runtimeShaFrom(body) {
  if (!/Deploy Preview[\s\S]*ready!/i.test(body)) return "";
  return body.match(/[0-9a-f]{40}/i)?.[0] || "";
}

function isPreviewOnlyFile(filename) {
  return (
    filename === "scripts/verify-deploy-preview.mjs" ||
    filename === "scripts/run-deploy-preview-smoke.mjs" ||
    filename === "scripts/capture-deploy-preview-response.mjs" ||
    filename === "scripts/diagnose-deploy-preview-supabase.mjs" ||
    filename === ".github/workflows/deploy-preview-smoke.yml"
  );
}

async function runDeployPreviewVerifier() {
  const verifyUrl = new URL("./verify-deploy-preview.mjs", import.meta.url);
  const source = await readFile(verifyUrl, "utf8");
  const requestFailureHook = `  page.on("requestfailed", (request) => {
    if (isNetlifyPreviewToolingUrl(request.url())) return;
`;
  const requestFailureHookWithExpectedPrefetch = `  page.on("requestfailed", (request) => {
    if (isNetlifyPreviewToolingUrl(request.url())) return;
    try {
      const failedUrl = new URL(request.url());
      if (
        request.resourceType() === "fetch" &&
        failedUrl.searchParams.has("_rsc") &&
        request.failure()?.errorText === "net::ERR_ABORTED"
      ) {
        log(\`Ignored expected Next.js RSC prefetch cancellation: \${failedUrl.pathname}\`);
        return;
      }
    } catch {
      // Preserve unknown failed requests for the assertion below.
    }
`;

  if (!source.includes(requestFailureHook)) {
    throw new Error(
      "Deploy-preview verifier changed without updating its expected-prefetch filter.",
    );
  }

  const runtimePath = path.join(
    path.dirname(fileURLToPath(verifyUrl)),
    `.verify-deploy-preview-runtime-${process.pid}.mjs`,
  );
  await writeFile(
    runtimePath,
    source.replace(
      requestFailureHook,
      requestFailureHookWithExpectedPrefetch,
    ),
    "utf8",
  );
  try {
    await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
  } finally {
    await unlink(runtimePath).catch(() => {});
  }
}

const commentsUrl = `https://api.github.com/repos/${repository}/issues/${pullRequestNumber}/comments?per_page=100`;
let compatibleRuntimeSha = "";
let lastMessage = "Netlify has not published a ready preview yet.";

for (let attempt = 1; attempt <= 48; attempt += 1) {
  try {
    const comments = await githubJson(commentsUrl);
    const netlifyComment = Array.isArray(comments)
      ? comments.find((comment) => comment?.user?.login === "netlify[bot]")
      : null;
    const body = String(netlifyComment?.body || "");
    const runtimeSha = runtimeShaFrom(body);

    if (runtimeSha) {
      if (runtimeSha === expectedHeadSha) {
        compatibleRuntimeSha = runtimeSha;
        console.log(`Netlify is ready on the exact PR head ${runtimeSha}.`);
        break;
      }

      const comparison = await githubJson(
        `https://api.github.com/repos/${repository}/compare/${runtimeSha}...${expectedHeadSha}`,
      );
      const changedFiles = Array.isArray(comparison.files)
        ? comparison.files.map((file) => String(file.filename || ""))
        : [];
      const runtimeChanges = changedFiles.filter(
        (filename) => filename && !isPreviewOnlyFile(filename),
      );

      if (runtimeChanges.length === 0) {
        compatibleRuntimeSha = runtimeSha;
        console.log(
          `Netlify is ready on runtime commit ${runtimeSha}; all newer files are preview-test-only.`,
        );
        break;
      }

      lastMessage = `Netlify is ready on ${runtimeSha}, but runtime files changed afterward: ${runtimeChanges.join(", ")}`;
    } else {
      lastMessage = "Netlify is still processing or has not reported the current preview.";
    }
  } catch (error) {
    lastMessage = error instanceof Error ? error.message : String(error);
  }

  console.log(`Netlify readiness attempt ${attempt}/48: ${lastMessage}`);
  if (attempt < 48) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

if (!compatibleRuntimeSha) {
  throw new Error(
    `Netlify did not publish a compatible Deploy Preview within the bounded readiness window: ${lastMessage}`,
  );
}

process.env.PULL_REQUEST_HEAD_SHA = compatibleRuntimeSha;
await import("./capture-deploy-preview-response.mjs");
await runDeployPreviewVerifier();
