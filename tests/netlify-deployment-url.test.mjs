import assert from "node:assert/strict";
import test from "node:test";

import {
  netlifyDeploymentContext,
  netlifySiteOrigin,
} from "../netlify/functions/_deployment-url.mjs";
import {
  reminderWorkerConfiguration,
  runBookingReminderWorker,
} from "../netlify/functions/_booking-reminder-worker.mjs";
import { mediaCleanupConfiguration } from "../netlify/functions/media-cleanup.mjs";
import { pickupCleanupConfiguration } from "../netlify/functions/pickup-reservation-cleanup.mjs";

const productionOrigin = "https://girlzculture.com";
const previewOrigin =
  "https://deploy-preview-51--girlzculture.netlify.app";

test("context-less production-mode functions retain preview identity", () => {
  const environment = {
    NODE_ENV: "production",
    URL: productionOrigin,
    NEXT_PUBLIC_SITE_URL: productionOrigin,
    DEPLOY_PRIME_URL: `${previewOrigin}/path`,
    DEPLOY_URL:
      "https://68c000000000000000000051--girlzculture.netlify.app",
  };
  assert.equal(netlifyDeploymentContext(environment), "deploy-preview");
  assert.equal(netlifySiteOrigin(environment), previewOrigin);
});

test("scheduled functions infer production from the canonical URL", () => {
  assert.equal(
    netlifyDeploymentContext({ URL: productionOrigin }),
    "production",
  );
  assert.equal(netlifySiteOrigin({ URL: productionOrigin }), productionOrigin);
});

test("context-less branch functions use the branch alias", () => {
  const environment = {
    NODE_ENV: "production",
    URL: productionOrigin,
    DEPLOY_PRIME_URL:
      "https://codex-workstream-1--girlzculture.netlify.app",
  };
  assert.equal(netlifyDeploymentContext(environment), "branch-deploy");
  assert.equal(
    netlifySiteOrigin(environment),
    "https://codex-workstream-1--girlzculture.netlify.app",
  );
});

test("a preview request is preferred to a production site fallback", () => {
  const environment = {
    NODE_ENV: "production",
    REVIEW_ID: "51",
    URL: productionOrigin,
  };
  assert.equal(
    netlifySiteOrigin(environment, `${previewOrigin}/.netlify/functions/test`),
    previewOrigin,
  );
  const trustedDeployOrigin =
    "https://68c000000000000000000051--girlzculture.netlify.app";
  assert.equal(
    netlifySiteOrigin(
      {
        ...environment,
        CONTEXT: "deploy-preview",
        DEPLOY_URL: trustedDeployOrigin,
      },
      "https://deploy-preview-51--untrusted.example/.netlify/functions/test",
    ),
    trustedDeployOrigin,
  );
});

test("preview request origins require the current Girlz Culture Netlify identity", () => {
  const environment = {
    CONTEXT: "deploy-preview",
    REVIEW_ID: "51",
    URL: productionOrigin,
  };
  for (const requestUrl of [
    "https://deploy-preview-51--untrusted.example/.netlify/functions/test",
    "https://untrusted.example/.netlify/functions/test",
    "https://deploy-preview-21--girlzculture.netlify.app/.netlify/functions/test",
  ]) {
    assert.equal(netlifySiteOrigin(environment, requestUrl), "");
  }
  assert.equal(
    netlifySiteOrigin(environment, `${previewOrigin}/.netlify/functions/test`),
    previewOrigin,
  );
});

test("a branch-scoped public preview URL wins before production URL", () => {
  assert.equal(
    netlifySiteOrigin({
      CONTEXT: "deploy-preview",
      REVIEW_ID: "51",
      URL: productionOrigin,
      NEXT_PUBLIC_SITE_URL: previewOrigin,
    }),
    previewOrigin,
  );
});

test("stale or unproven public preview URLs fail closed", () => {
  assert.equal(
    netlifySiteOrigin({
      CONTEXT: "deploy-preview",
      REVIEW_ID: "51",
      NEXT_PUBLIC_SITE_URL:
        "https://deploy-preview-21--girlzculture.netlify.app",
    }),
    "",
  );
  assert.equal(
    netlifySiteOrigin({
      CONTEXT: "deploy-preview",
      NEXT_PUBLIC_SITE_URL: previewOrigin,
    }),
    "",
  );
});

test("branch deploy public aliases require the current branch identity", () => {
  assert.equal(
    netlifySiteOrigin({
      CONTEXT: "branch-deploy",
      BRANCH: "codex/workstream-1",
      NEXT_PUBLIC_SITE_URL:
        "https://codex-workstream-1--girlzculture.netlify.app",
    }),
    "https://codex-workstream-1--girlzculture.netlify.app",
  );
  assert.equal(
    netlifySiteOrigin({
      CONTEXT: "branch-deploy",
      BRANCH: "codex/workstream-2",
      NEXT_PUBLIC_SITE_URL:
        "https://codex-workstream-1--girlzculture.netlify.app",
    }),
    "",
  );
});

test("an explicit production context keeps the canonical production origin", () => {
  const environment = {
    CONTEXT: "production",
    NODE_ENV: "production",
    URL: productionOrigin,
    DEPLOY_PRIME_URL: previewOrigin,
  };
  assert.equal(netlifyDeploymentContext(environment), "production");
  assert.equal(netlifySiteOrigin(environment), productionOrigin);
});

test("a preview with only the production URL fails closed", () => {
  assert.equal(
    netlifySiteOrigin({
      CONTEXT: "deploy-preview",
      DEPLOY_PRIME_URL: "javascript:alert(1)",
      DEPLOY_URL: "https://user:password@example.com",
      URL: `${productionOrigin}/path`,
    }),
    "",
  );
});

test("a branch deploy with only production URL variables fails closed", () => {
  assert.equal(
    netlifySiteOrigin({
      CONTEXT: "branch-deploy",
      URL: productionOrigin,
      NEXT_PUBLIC_SITE_URL: productionOrigin,
    }),
    "",
  );
});

test("a sparse preview reminder worker reports not configured without fetching production", async () => {
  const environment = {
    CONTEXT: "deploy-preview",
    URL: productionOrigin,
    NEXT_PUBLIC_SITE_URL: productionOrigin,
    INTERNAL_API_SECRET: "present-but-never-sent",
  };
  assert.deepEqual(reminderWorkerConfiguration(environment), {
    root: "",
    hasInternalSecret: true,
  });

  let fetchCalls = 0;
  await assert.rejects(
    runBookingReminderWorker({
      environment,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("fetch must not run");
      },
      sleep: async () => {},
    }),
    /REMINDER_WORKER_NOT_CONFIGURED/,
  );
  assert.equal(fetchCalls, 0);
});

test("a stale preview reminder worker refuses before sending its internal secret", async () => {
  const environment = {
    CONTEXT: "deploy-preview",
    REVIEW_ID: "51",
    NEXT_PUBLIC_SITE_URL:
      "https://deploy-preview-21--girlzculture.netlify.app",
    INTERNAL_API_SECRET: "present-but-never-sent",
  };
  assert.equal(reminderWorkerConfiguration(environment).root, "");

  let fetchCalls = 0;
  await assert.rejects(
    runBookingReminderWorker({
      environment,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("fetch must not run");
      },
      sleep: async () => {},
    }),
    /REMINDER_WORKER_NOT_CONFIGURED/,
  );
  assert.equal(fetchCalls, 0);
});

test("sparse preview cleanup workers are not configured with a production origin", () => {
  const environment = {
    CONTEXT: "branch-deploy",
    URL: productionOrigin,
    NEXT_PUBLIC_SITE_URL: productionOrigin,
    CRON_SECRET: "present-but-never-sent",
  };
  assert.deepEqual(mediaCleanupConfiguration(environment), {
    root: "",
    configured: false,
  });
  assert.deepEqual(pickupCleanupConfiguration(environment), {
    root: "",
    configured: false,
  });
});
