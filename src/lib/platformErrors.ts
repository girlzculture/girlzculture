import type { SupabaseClient } from "@supabase/supabase-js";

export type ErrorContext = {
  request?: Request;
  admin?: SupabaseClient;
  error: unknown;
  feature: string;
  action: string;
  actorRole?: string;
  salonId?: string | null;
  safeMessage: string;
  severity?: "critical" | "high" | "medium" | "low";
  metadata?: Record<string, unknown>;
};

export class UserSafeRequestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "UserSafeRequestError";
  }
}

export function rejectRequest(message: string, status = 400): never {
  throw new UserSafeRequestError(message, status);
}

const SECRET_PATTERN = /(authorization|cookie|password|secret|token|api[-_]?key|card|cvc|service[-_]?role)/i;

function safeText(value: unknown, max = 2_000) {
  return String(value ?? "")
    .replace(/bearer\s+[a-z0-9._~+/-]+/gi, "[redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email redacted]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[number redacted]")
    .replace(/[\u0000-\u001f]/g, " ")
    .slice(0, max);
}

function safeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return safeText(value, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeMetadata(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_PATTERN.test(key))
      .slice(0, 30)
      .map(([key, item]) => [key, safeMetadata(item, depth + 1)]));
  }
  return safeText(value, 200);
}

function hashFingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `gc-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function capturePlatformError(context: ErrorContext) {
  const reference = crypto.randomUUID();
  const record = context.error && typeof context.error === "object" ? context.error as Record<string, unknown> : {};
  const technicalMessage = safeText(context.error instanceof Error ? context.error.message : record.message || context.error || "Unknown error");
  const technicalStack = safeText(context.error instanceof Error ? context.error.stack : record.details || "", 6_000);
  const release = process.env.COMMIT_REF || process.env.NEXT_PUBLIC_COMMIT_REF || process.env.DEPLOY_ID || "local";
  const environment = process.env.CONTEXT || process.env.NODE_ENV || "unknown";
  const route = context.request ? new URL(context.request.url).pathname : null;
  const fingerprint = hashFingerprint(`${context.feature}|${context.action}|${String(record.code || "")}|${technicalMessage.slice(0, 300)}`);
  const logRecord = {
    reference,
    fingerprint,
    severity: context.severity || "high",
    environment,
    release,
    route,
    action: context.action,
    feature: context.feature,
    actor_role: context.actorRole || "unknown",
    salon_id: context.salonId || null,
    technical_message: technicalMessage,
    technical_stack: technicalStack || null,
    user_safe_message: context.safeMessage,
    metadata: safeMetadata({ code: record.code, hint: record.hint, ...context.metadata }),
  };

  console.error("Platform operation failed", logRecord);
  if (context.admin) {
    try {
      const { error } = await context.admin.rpc("capture_platform_error", { p_event: logRecord });
      if (error && error.code !== "PGRST202") console.error("Platform error persistence failed", { reference, code: error.code, message: safeText(error.message, 500) });
    } catch (persistenceError) {
      console.error("Platform error persistence unavailable", { reference, message: safeText(persistenceError, 500) });
    }
  }
  return reference;
}

export function safeFailure(message: string, reference: string, status = 500) {
  return Response.json(
    { error: `${message} Please try again or contact support with reference ${reference}.`, request_id: reference },
    { status, headers: { "Cache-Control": "private, no-store", "X-Request-ID": reference } },
  );
}

export async function monitoredRouteFailure(context: ErrorContext) {
  if (context.error instanceof UserSafeRequestError) {
    return Response.json({ error: context.error.message }, { status: context.error.status, headers: { "Cache-Control": "private, no-store" } });
  }
  const message = context.error instanceof Error ? context.error.message : "";
  if (/^Unauthorized$/i.test(message)) {
    return Response.json({ error: "Please sign in again." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  if (/^Forbidden(?::|$)/i.test(message)) {
    return Response.json({ error: "You do not have permission to use this feature." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  const reference = await capturePlatformError(context);
  return safeFailure(context.safeMessage, reference);
}
