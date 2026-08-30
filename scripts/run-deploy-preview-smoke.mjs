import {
  assertPreviewSeedReadiness,
  runtimeShaFromNetlifyComment,
} from "./deploy-preview-smoke-core.mjs";

const repository = String(process.env.GITHUB_REPOSITORY || "");
const pullRequestNumber = String(process.env.PULL_REQUEST_NUMBER || "");
const expectedHeadSha = String(process.env.PULL_REQUEST_HEAD_SHA || "").toLowerCase();
const githubToken = String(process.env.GITHUB_TOKEN || "");

if (!repository || !pullRequestNumber || !expectedHeadSha || !githubToken) {
  throw new Error(
    "GitHub repository, pull request, head SHA, and token are required for Netlify preview readiness.",
  );
}
if (!/^[0-9a-f]{40}$/.test(expectedHeadSha)) {
  throw new Error("PULL_REQUEST_HEAD_SHA must be a full 40-character Git commit SHA.");
}

assertPreviewSeedReadiness({
  eventAction: process.env.PREVIEW_SEED_READINESS_EVENT,
  eventLabel: process.env.PREVIEW_SEED_READINESS_LABEL,
  attestedPullRequestNumber: process.env.PREVIEW_SEED_READINESS_PR,
  attestedHeadSha: process.env.PREVIEW_SEED_READINESS_HEAD_SHA,
  expectedPullRequestNumber: pullRequestNumber,
  expectedHeadSha,
});

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
    throw new Error(`GitHub API returned HTTP ${response.status} while checking preview readiness.`);
  }
  return response.json();
}

const commentsUrl = `https://api.github.com/repos/${repository}/issues/${pullRequestNumber}/comments?per_page=100`;
let exactRuntimeReady = false;
let lastMessage = "Netlify has not published a ready preview yet.";

for (let attempt = 1; attempt <= 60; attempt += 1) {
  try {
    const comments = await githubJson(commentsUrl);
    const netlifyComments = (Array.isArray(comments) ? comments : [])
      .filter((comment) => comment?.user?.login === "netlify[bot]")
      .sort(
        (left, right) =>
          Date.parse(String(right?.updated_at || "")) -
          Date.parse(String(left?.updated_at || "")),
      );
    const publishedRuntimeShas = netlifyComments
      .map((comment) => runtimeShaFromNetlifyComment(comment?.body))
      .filter(Boolean);

    if (publishedRuntimeShas.includes(expectedHeadSha)) {
      exactRuntimeReady = true;
      console.log(`Netlify is ready on the exact PR head ${expectedHeadSha}.`);
      break;
    }

    lastMessage = publishedRuntimeShas.length
      ? `Netlify is ready on ${publishedRuntimeShas[0]}, not the required PR head ${expectedHeadSha}.`
      : "Netlify is still processing or has not reported a ready preview.";
  } catch (error) {
    lastMessage = error instanceof Error ? error.message : String(error);
  }

  console.log(`Netlify readiness attempt ${attempt}/60: ${lastMessage}`);
  if (attempt < 60) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

if (!exactRuntimeReady) {
  throw new Error(
    `Netlify did not publish the exact pull-request head within the bounded readiness window: ${lastMessage}`,
  );
}

await import("./verify-deploy-preview.mjs");
if ((process.env.DEPLOY_PREVIEW_SMOKE_SCOPE || "core") === "core") {
  // Capture/uploadable evidence only after the verifier has proved that this
  // is the expected staging deployment and exact release. This prevents a
  // mislinked preview from exporting visible content before its identity and
  // synthetic-data boundary have been established.
  await import("./capture-deploy-preview-response.mjs");
}
