const RETRYABLE_STATUS = new Set([408, 429]);
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function retryableStatus(status) {
  return RETRYABLE_STATUS.has(status) || status >= 500;
}

function safeRootUrl(environment) {
  const candidate =
    environment.DEPLOY_PRIME_URL ||
    environment.URL ||
    environment.NEXT_PUBLIC_SITE_URL ||
    "";
  try {
    const parsed = new URL(candidate);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function responsePayload(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function correlatedResponse(response, text, payload) {
  const reference = isUuid(payload?.request_id)
    ? String(payload.request_id)
    : isUuid(response.headers.get("x-request-id"))
      ? String(response.headers.get("x-request-id"))
      : "";
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "private, no-store",
  });
  if (reference) headers.set("x-request-id", reference);
  return new Response(text, { status: response.status, headers });
}

export function reminderWorkerConfiguration(environment = process.env) {
  return {
    root: safeRootUrl(environment),
    hasInternalSecret: Boolean(environment.INTERNAL_API_SECRET),
  };
}

export async function runBookingReminderWorker({
  fetchImpl = fetch,
  environment = process.env,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
} = {}) {
  const { root, hasInternalSecret } = reminderWorkerConfiguration(environment);
  if (!root || !hasInternalSecret) {
    throw new Error("REMINDER_WORKER_NOT_CONFIGURED");
  }

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${root}/api/bookings/reminders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": environment.INTERNAL_API_SECRET,
        },
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = responsePayload(text);

      if (response.ok) {
        if (!payload) throw new Error("REMINDER_UPSTREAM_INVALID_JSON");
        return correlatedResponse(response, text, payload);
      }

      if (retryableStatus(response.status) && attempt < maxAttempts) {
        await sleep(attempt * 250);
        continue;
      }

      // The protected Next.js route owns operational monitoring. When it has
      // already produced a reference, forward that exact response instead of
      // creating a second, unrelated Netlify incident.
      if (
        isUuid(payload?.request_id) ||
        isUuid(response.headers.get("x-request-id"))
      ) {
        return correlatedResponse(response, text, payload);
      }

      const upstreamError = new Error(`REMINDER_UPSTREAM_HTTP_${response.status}`);
      upstreamError.retryable = false;
      throw upstreamError;
    } catch (error) {
      lastError = error;
      if (error?.retryable === false || attempt >= maxAttempts) break;
      await sleep(attempt * 250);
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError instanceof Error && lastError.name === "AbortError") {
    throw new Error("REMINDER_UPSTREAM_TIMEOUT");
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("REMINDER_UPSTREAM_UNAVAILABLE");
}
