import { monitoredNetlifyFailure } from "./_monitoring.mjs";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [750, 2_000];
const REQUEST_TIMEOUT_MS = 25_000;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryAfterMilliseconds(response, fallback) {
  const raw = response.headers.get("retry-after");
  if (!raw) return fallback;
  const seconds = Number(raw);
  if (Number.isFinite(seconds))
    return Math.min(10_000, Math.max(0, seconds * 1_000));
  const date = Date.parse(raw);
  return Number.isFinite(date)
    ? Math.min(10_000, Math.max(0, date - Date.now()))
    : fallback;
}

async function requestCleanup(url, secret) {
  let lastResponse = null;
  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: controller.signal,
      });
      lastResponse = response;
      if (response.ok || !RETRYABLE_STATUS.has(response.status)) return response;
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(
          retryAfterMilliseconds(response, RETRY_DELAYS_MS[attempt]),
        );
      }
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error("MEDIA_CLEANUP_NETWORK_FAILED");
}

const mediaCleanup = async () => {
  try {
    const root = (process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(
      /\/$/,
      "",
    );
    if (!root || !process.env.CRON_SECRET)
      throw new Error("MEDIA_CLEANUP_NOT_CONFIGURED");
    const response = await requestCleanup(
      `${root}/api/media/cleanup`,
      process.env.CRON_SECRET,
    );
    const body = await response.text();
    if (!response.ok) {
      const code = RETRYABLE_STATUS.has(response.status)
        ? `MEDIA_CLEANUP_UPSTREAM_RETRY_EXHAUSTED_${response.status}`
        : `MEDIA_CLEANUP_UPSTREAM_HTTP_${response.status}`;
      throw new Error(code);
    }
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return monitoredNetlifyFailure({
      error,
      feature: "media",
      action: "media-cleanup",
      safeMessage: "Staged media cleanup could not finish.",
      provider: "netlify-scheduled-function",
    });
  }
};

export default mediaCleanup;
