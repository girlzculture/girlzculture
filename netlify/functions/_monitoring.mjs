const SECRET_PATTERN = /(authorization|cookie|password|secret|token|api[-_]?key|card|cvc|service[-_]?role)/i;

function safeText(value, max = 2_000) {
  return String(value || "")
    .replace(/bearer\s+[a-z0-9._~+/-]+/gi, "[redacted]")
    .replace(/\b(?:sk|pk)_(?:live|test)_[a-z0-9_-]+\b/gi, "[key redacted]")
    .replace(/\bwhsec_[a-z0-9_-]+\b/gi, "[secret redacted]")
    .replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, "[token redacted]")
    .replace(/\b(api[-_ ]?key|secret|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email redacted]")
    .replace(/\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone redacted]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[number redacted]")
    .replace(/[\u0000-\u001f]/g, " ")
    .slice(0, max);
}

function safeMetadata(value, depth = 0) {
  if (depth > 3) return "[truncated]";
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return safeText(value, 300);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeMetadata(item, depth + 1));
  if (!value || typeof value !== "object") return safeText(value, 200);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_PATTERN.test(key))
      .slice(0, 20)
      .map(([key, item]) => [key, safeMetadata(item, depth + 1)]),
  );
}

function fingerprint(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `gc-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function persist(record) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/capture_platform_error`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_event: record }),
    });
    if (!response.ok) throw new Error("MONITORING_PERSISTENCE_REJECTED");
  } catch {
    console.error("Netlify monitoring persistence unavailable", { reference: record.reference });
  }
}

export async function monitoredNetlifyFailure({
  request,
  error,
  feature,
  action,
  safeMessage,
  provider = null,
  metadata = {},
}) {
  const reference = crypto.randomUUID();
  const technicalMessage = safeText(error instanceof Error ? error.message : error || "Unknown error");
  const route = request ? new URL(request.url).pathname : `/.netlify/functions/${action}`;
  const release = process.env.COMMIT_REF || process.env.DEPLOY_ID || "local";
  const environment = process.env.CONTEXT || process.env.NODE_ENV || "unknown";
  const record = {
    reference,
    fingerprint: fingerprint(`${feature}|${action}|${technicalMessage.slice(0, 300)}`),
    severity: "high",
    environment,
    release,
    route,
    action,
    feature,
    actor_role: "system",
    salon_id: null,
    technical_message: technicalMessage,
    technical_stack: null,
    user_safe_message: safeMessage,
    metadata: safeMetadata({ provider, function: action, ...metadata }),
  };
  console.error("Netlify operation failed", record);
  await persist(record);
  return new Response(
    JSON.stringify({
      error: `${safeMessage} Reference ${reference}.`,
      request_id: reference,
    }),
    {
      status: 500,
      headers: {
        "content-type": "application/json",
        "cache-control": "private, no-store",
        "x-request-id": reference,
      },
    },
  );
}
