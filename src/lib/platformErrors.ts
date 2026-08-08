import type { SupabaseClient } from "@supabase/supabase-js";
import { isStaticBuildPhase } from "@/lib/buildPhaseCore";
import { deploymentReleaseId } from "@/lib/deploymentIdentity";

export type ErrorContext = {
  request?: Request;
  admin?: SupabaseClient;
  error: unknown;
  feature: string;
  action: string;
  actorRole?: string;
  actorId?: string | null;
  salonId?: string | null;
  recordType?: string | null;
  recordId?: string | null;
  provider?: string | null;
  safeMessage: string;
  severity?: "critical" | "high" | "medium" | "low";
  metadata?: Record<string, unknown>;
};

export class UserSafeRequestError extends Error {
  public status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserSafeRequestError";
    this.status = status;
  }
}

export function rejectRequest(message: string, status = 400): never {
  throw new UserSafeRequestError(message, status);
}

const SECRET_PATTERN = /(authorization|cookie|password|secret|token|api[-_]?key|card|cvc|service[-_]?role)/i;

function safeText(value: unknown, max = 2_000) {
  return String(value ?? "")
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
  const release = deploymentReleaseId();
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
    metadata: safeMetadata({
      code: record.code,
      hint: record.hint,
      acting_account_id: context.actorId || null,
      affected_record: context.recordType || context.recordId
        ? { type: context.recordType || "record", id: context.recordId || null }
        : null,
      provider: context.provider || null,
      ...context.metadata,
    }),
  };

  console.error("Platform operation failed", logRecord);
  // A production build can legitimately encounter a schema that has not yet
  // received the branch migrations. Preserve a sanitized build log and local
  // reference, but never mutate an attached database during static generation.
  if (context.admin && !isStaticBuildPhase()) {
    try {
      // Monitoring must never hold the original user/system operation open
      // behind a slow or unavailable database. The function log above is the
      // durable provider-side fallback when this bounded persistence misses.
      const persistenceSignal = AbortSignal.timeout(1_500);
      const { data: eventId, error } = await context.admin.rpc(
        "capture_platform_error",
        { p_event: logRecord },
      ).abortSignal(persistenceSignal);
      if (error && error.code !== "PGRST202") console.error("Platform error persistence failed", { reference, code: error.code, message: safeText(error.message, 500) });
      if (!error && /^[0-9a-f-]{36}$/i.test(String(eventId || ""))) {
        const { data: event } = await context.admin
          .from("platform_error_events")
          .select("reference")
          .eq("id", eventId)
          .abortSignal(persistenceSignal)
          .maybeSingle();
        const canonicalReference = String(event?.reference || "");
        if (/^[0-9a-f-]{36}$/i.test(canonicalReference)) {
          return canonicalReference;
        }
      }
    } catch (persistenceError) {
      console.error("Platform error persistence unavailable", { reference, message: safeText(persistenceError, 500) });
    }
  }
  return reference;
}

export function safeFailure(
  message: string,
  reference: string,
  status = 500,
  details: {
    code?: string;
    recordType?: string | null;
    recordId?: string | null;
  } = {},
) {
  return Response.json(
    {
      error: `${message} Please try again or contact support with reference ${reference}.`,
      request_id: reference,
      ...(details.code ? { code: details.code } : {}),
      ...(details.recordType ? { record_type: details.recordType } : {}),
      ...(details.recordId ? { record_id: details.recordId } : {}),
    },
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
  const errorRecord =
    context.error && typeof context.error === "object"
      ? (context.error as Record<string, unknown>)
      : {};
  const providerUnavailable =
    Number(errorRecord.status || 0) === 503 &&
    String(errorRecord.code || "") === "AUTHENTICATION_PROVIDER_UNAVAILABLE";
  const reference = await capturePlatformError(
    providerUnavailable
      ? {
          ...context,
          // Supabase cannot persist its own outage while it is unavailable.
          // Return promptly and retain the correlation record in function logs.
          admin: undefined,
          actorId: null,
          provider: context.provider || "supabase",
        }
      : context,
  );
  return safeFailure(
    providerUnavailable
      ? "The authentication service is temporarily unavailable."
      : context.safeMessage,
    reference,
    providerUnavailable ? 503 : 500,
    {
      code: providerUnavailable
        ? "AUTHENTICATION_PROVIDER_UNAVAILABLE"
        : undefined,
      recordType: context.recordType,
      recordId: context.recordId,
    },
  );
}
