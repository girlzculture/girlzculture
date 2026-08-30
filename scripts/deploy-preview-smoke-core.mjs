import assert from "node:assert/strict";

const SENSITIVE_KEY =
  /(?:authorization|cookie|token|secret|password|passcode|api[_-]?key|^key$|service[_-]?role|card|cvc|cvv|phone|session|credential|signature)/i;
const SAFE_RESPONSE_HEADERS = new Set([
  "cache-control",
  "content-type",
  "etag",
  "last-modified",
  "x-girlz-culture-environment",
  "x-girlz-culture-release",
  "x-nf-request-id",
  "x-request-id",
]);

function sensitiveQueryKey(value) {
  let key = String(value || "");
  try {
    key = decodeURIComponent(key.replaceAll("+", " "));
  } catch {
    // Keep the original key so malformed evidence still fails closed against
    // the recognizable sensitive-key patterns below.
  }
  return SENSITIVE_KEY.test(key) || /email|code/i.test(key);
}

export const PREVIEW_SEED_READINESS_LABEL = "provider-preview-seeded";

export function previewSeedReadiness({
  eventAction,
  eventLabel,
  attestedPullRequestNumber,
  attestedHeadSha,
  expectedPullRequestNumber,
  expectedHeadSha,
} = {}) {
  const action = String(eventAction || "");
  const label = String(eventLabel || "");
  const attestedPr = String(attestedPullRequestNumber || "");
  const expectedPr = String(expectedPullRequestNumber || "");
  const attestedSha = String(attestedHeadSha || "").toLowerCase();
  const expectedSha = String(expectedHeadSha || "").toLowerCase();

  if (action !== "labeled" || label !== PREVIEW_SEED_READINESS_LABEL) {
    return {
      ready: false,
      reason:
        "Deep provider smoke requires a fresh provider-preview-seeded label event after the disposable preview seed is verified.",
    };
  }
  if (!/^\d+$/.test(expectedPr) || attestedPr !== expectedPr) {
    return {
      ready: false,
      reason: "Preview seed readiness was not attested for this pull request.",
    };
  }
  if (
    !/^[0-9a-f]{40}$/.test(expectedSha) ||
    attestedSha !== expectedSha
  ) {
    return {
      ready: false,
      reason: "Preview seed readiness was not attested for this exact pull-request head.",
    };
  }
  return { ready: true, reason: "Preview seed readiness is explicitly attested." };
}

export function assertPreviewSeedReadiness(input) {
  const result = previewSeedReadiness(input);
  assert(result.ready, result.reason);
  return result;
}

export function runtimeShaFromNetlifyComment(body) {
  if (!/Deploy Preview[\s\S]*ready!/i.test(String(body || ""))) return "";
  return String(body || "").match(/\b[0-9a-f]{40}\b/i)?.[0]?.toLowerCase() || "";
}

export function sanitizeUrl(value, baseUrl) {
  try {
    const url = new URL(String(value || ""), baseUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveQueryKey(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return sanitizeText(value, 500);
  }
}

export function sanitizeText(value, maximumLength = 4_000) {
  return String(value || "")
    .replace(
      /([?&])([^=&#\s"'<>;,]+)=([^&#\s"'<>;,]*)/g,
      (match, separator, key) =>
        sensitiveQueryKey(key) ? `${separator}${key}=[redacted]` : match,
    )
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/sb_(?:publishable|anon|secret|service_role)_[A-Za-z0-9._~-]+/gi, "[redacted-supabase-key]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .replace(
      /(["']?(?:authorization|cookie|set-cookie|token|secret|password|passcode|api[_-]?key|key|service[_-]?role[_-]?key|card|cvc|cvv|phone|session|credential|signature)["']?\s*[:=]\s*)(["']?)[^\s,;"'&#?]+\2/gi,
      "$1[redacted]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[number redacted]")
    .replace(
      /(?<![A-Za-z0-9])(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?![A-Za-z0-9])/g,
      "[phone redacted]",
    )
    .slice(0, Math.max(0, maximumLength));
}

export function sanitizeValue(value, depth = 0) {
  if (depth > 6) return "[depth-limited]";
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "number" || typeof value === "boolean" || value == null)
    return value;
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value !== "object") return sanitizeText(value);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeValue(item, depth + 1),
      ]),
  );
}

export function safeResponseHeaders(headers) {
  const entries =
    headers && typeof headers.entries === "function"
      ? [...headers.entries()]
      : Object.entries(headers || {});
  return Object.fromEntries(
    entries
      .filter(([key]) => SAFE_RESPONSE_HEADERS.has(String(key).toLowerCase()))
      .map(([key, value]) => [String(key).toLowerCase(), sanitizeText(value, 500)]),
  );
}

export function summarizeJsonBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { kind: Array.isArray(value) ? "array" : typeof value };
  }
  const body = /** @type {Record<string, unknown>} */ (value);
  const summary = {
    keys: Object.keys(body).filter((key) => !SENSITIVE_KEY.test(key)).slice(0, 40),
  };
  if (Array.isArray(body.salons)) summary.salon_count = body.salons.length;
  if (Array.isArray(body.videos)) summary.video_count = body.videos.length;
  if (Array.isArray(body.warnings)) summary.warning_count = body.warnings.length;
  if (Number.isFinite(Number(body.total))) summary.total = Number(body.total);
  if (body.revision != null) summary.revision = Number(body.revision);
  if (body.deployment && typeof body.deployment === "object") {
    const deployment = /** @type {Record<string, unknown>} */ (body.deployment);
    summary.deployment = {
      environment: sanitizeText(deployment.environment, 80),
      release: sanitizeText(deployment.release, 160),
    };
  }
  if (body.error) summary.error = sanitizeText(body.error, 500);
  if (body.reference || body.request_id)
    summary.reference = sanitizeText(body.reference || body.request_id, 160);
  return summary;
}

export function assertDeploymentConfig(body, expectedHeadSha) {
  assert(body && typeof body === "object", "Config API returned a non-object payload.");
  const deployment = body.deployment;
  assert(
    deployment && typeof deployment === "object",
    "Config API did not expose deployment identity.",
  );
  assert.equal(
    String(deployment.environment || ""),
    "deploy-preview",
    "Config API is not running in the Netlify deploy-preview environment.",
  );
  assert.equal(
    String(deployment.release || "").toLowerCase(),
    String(expectedHeadSha || "").toLowerCase(),
    "Config API release does not match the exact pull-request head.",
  );
}

function assertNoPrivateFields(record, label) {
  const keys = Object.keys(record || {});
  const privateKeys = keys.filter((key) =>
    /(?:email|phone|user_id|owner|stripe|payment|subscription_id|auth|token|secret|password|service_role)/i.test(
      key,
    ),
  );
  assert.deepEqual(privateKeys, [], `${label} exposed private fields: ${privateKeys.join(", ")}`);
}

function assertPreviewSalon(salon, label) {
  assert(salon && typeof salon === "object", `${label} is not an object.`);
  assertNoPrivateFields(salon, label);
  assert.match(String(salon.id || ""), /^[0-9a-f-]{36}$/i, `${label} has no stable ID.`);
  assert.match(String(salon.slug || ""), /^preview-[a-z0-9-]+$/, `${label} is not staging-labelled.`);
  assert.match(String(salon.name || ""), /^Preview\b/, `${label} has no visible staging label.`);
  assert(Number.isFinite(Number(salon.latitude)), `${label} has no latitude.`);
  assert(Number.isFinite(Number(salon.longitude)), `${label} has no longitude.`);
  assert(Number.isFinite(Number(salon.distance_miles)), `${label} has no distance.`);
  assert(Number(salon.distance_miles) <= 15, `${label} is outside the Harlem preview area.`);
  assert(Number.isFinite(Number(salon.starting_price)), `${label} has no starting price.`);
  assert(Array.isArray(salon.services) && salon.services.length > 0, `${label} has no services.`);
}

export function assertDiscoveryPayload(body, minimumCount = 6) {
  assert(body && typeof body === "object", "Discovery API returned a non-object payload.");
  assert(Array.isArray(body.salons), "Discovery API did not return a salons array.");
  assert(
    body.salons.length >= minimumCount,
    `Discovery API returned ${body.salons.length} salons; at least ${minimumCount} staging salons are required.`,
  );
  assert(Number(body.total) >= minimumCount, "Discovery API total is below the staging minimum.");
  body.salons.forEach((salon, index) => assertPreviewSalon(salon, `Discovery salon ${index + 1}`));
}

export function assertFeaturedPayload(body) {
  assert(body && typeof body === "object", "Featured API returned a non-object payload.");
  assert(Array.isArray(body.salons), "Featured API did not return a salons array.");
  assert(body.salons.length > 0, "Featured API returned no eligible staging campaign.");
  body.salons.forEach((salon, index) => assertPreviewSalon(salon, `Featured salon ${index + 1}`));
}

export function assertTrendingPayload(body) {
  assert(body && typeof body === "object", "Trending API returned a non-object payload.");
  assert(Array.isArray(body.videos), "Trending API did not return a videos array.");
  assert(Number.isFinite(Number(body.total)), "Trending API did not return a numeric total.");
}
