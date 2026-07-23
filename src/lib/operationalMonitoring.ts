import "server-only";

import { RateLimitError } from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  capturePlatformError,
  safeFailure,
  type ErrorContext,
} from "@/lib/platformErrors";
import {
  addOperationalWarnings,
  classifyOperationalRoute,
  isAuthenticationFailureMessage,
  isClearlyExpectedMessage,
  isPermissionDenialMessage,
  isUnsafeOperationalMessage,
  pickAffectedRecord,
  pickRouteRecord,
  safeOperationalCode,
  shouldCaptureResponse,
  type MonitoringClassification,
} from "@/lib/operationalMonitoringCore";
import {
  operationalFailures,
  runWithOperationalContext,
} from "@/lib/operationalTelemetryContext";

export { noteOperationalFailure } from "@/lib/operationalTelemetryContext";

type RouteHandler<TArgs extends unknown[] = unknown[]> = (
  request: Request,
  ...args: TArgs
) => Response | Promise<Response>;

export type MonitoringProfile = {
  route: string;
  method: string;
  feature: string;
  actorRole: string;
  classification: MonitoringClassification;
  safeMessage?: string;
  provider?: string;
};

function responseMessage(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const record = body as Record<string, unknown>;
  return typeof record.error === "string"
    ? record.error
    : typeof record.message === "string"
      ? record.message
      : "";
}

async function responseErrorMessage(response: Response) {
  try {
    const type = response.headers.get("content-type") || "";
    if (!type.includes("application/json")) return "";
    return responseMessage(await response.clone().json());
  } catch {
    return "";
  }
}

async function safeRequestRecord(request: Request, routeTemplate: string) {
  const url = new URL(request.url);
  const pathRecord = pickRouteRecord(routeTemplate, url.pathname);
  if (pathRecord) return pathRecord;
  const query = Object.fromEntries(
    [...url.searchParams.entries()].filter(([key]) => /(?:^id$|_id$|Id$)/.test(key)),
  );
  const queryRecord = pickAffectedRecord(query);
  if (queryRecord) return queryRecord;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return null;
  try {
    const type = request.headers.get("content-type") || "";
    if (!type.includes("application/json")) return null;
    return pickAffectedRecord(await request.clone().json());
  } catch {
    return null;
  }
}

async function verifiedActorId(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user?.id || null;
  } catch {
    return null;
  }
}

function monitoringAdmin() {
  try {
    return getSupabaseAdmin();
  } catch {
    return undefined;
  }
}

/**
 * Route-local replacement for raw console.error calls. Failures are held in the
 * request's async context; the wrapper decides whether an expected 4xx should
 * be discarded, an unexpected response should fail with a reference, or a
 * successful partial operation should carry a warning reference.
 */
async function captureForRoute(
  request: Request,
  profile: MonitoringProfile,
  error: unknown,
  record: { type: string; id: string } | null,
  overrides: Partial<ErrorContext> = {},
) {
  return capturePlatformError({
    request,
    admin: monitoringAdmin(),
    error,
    feature: profile.feature,
    action: `${profile.method.toLowerCase()}:${profile.route}`,
    actorRole: profile.actorRole,
    actorId: await verifiedActorId(request),
    recordType: record?.type || null,
    recordId: record?.id || null,
    provider: overrides.provider || profile.provider || null,
    safeMessage: profile.safeMessage || "This operation could not be completed.",
    metadata: {
      classification: profile.classification,
      method: profile.method,
      ...overrides.metadata,
    },
    severity: overrides.severity,
  });
}

function privateNoStore(response: Response) {
  const headers = new Headers(response.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function failureProvider(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const provider = String((error as Record<string, unknown>).provider || "").trim();
  return /^[a-z][a-z0-9_-]{1,39}$/i.test(provider) ? provider : null;
}

export function withOperationalMonitoring<TArgs extends unknown[]>(
  profile: MonitoringProfile,
  handler: RouteHandler<TArgs>,
): RouteHandler<TArgs> {
  return async (request, ...args) => {
    const affectedRecord = await safeRequestRecord(request, profile.route);
    return runWithOperationalContext(async () => {
      try {
        const response = await handler(request, ...args);
        if (response.headers.get("X-Request-ID")) return response;

        const message = await responseErrorMessage(response);
        const failures = operationalFailures();
        const unsafeReportedFailure = failures.find((failure) => {
          const record = failure.error && typeof failure.error === "object"
            ? failure.error as Record<string, unknown>
            : {};
          return isUnsafeOperationalMessage(
            failure.error instanceof Error
              ? failure.error.message
              : `${String(record.code || "")} ${String(record.message || failure.error || "")}`,
          );
        });
        if (
          (profile.classification === "protected" || profile.classification === "provider-backed") &&
          isPermissionDenialMessage(message) &&
          !unsafeReportedFailure
        ) {
          return privateNoStore(response);
        }
        if (
          shouldCaptureResponse(response.status, message, profile.classification)
          || (response.status >= 400 && Boolean(unsafeReportedFailure))
        ) {
          const authFailure = response.status === 401 || isAuthenticationFailureMessage(message);
          const severity = authFailure ? "low" : "high";
          const reported = unsafeReportedFailure || failures.at(-1);
          const reference = await captureForRoute(
            request,
            profile,
            reported?.error || new Error(safeOperationalCode(response.status)),
            affectedRecord,
            {
              severity,
              provider: failureProvider(reported?.error),
              metadata: {
                returned_status: response.status,
                reported_operation: reported?.operation || null,
              },
            },
          );
          const status = authFailure ? 401 : 500;
          const safeMessage = authFailure
            ? "Your session could not be verified."
            : profile.safeMessage || "This operation could not be completed.";
          return safeFailure(safeMessage, reference, status);
        }

        if (response.status < 400 && failures.length) {
          const references: string[] = [];
          for (const reported of failures.slice(0, 10)) {
            references.push(await captureForRoute(
              request,
              profile,
              reported.error,
              affectedRecord,
              {
                severity: "high",
                provider: failureProvider(reported.error),
                metadata: {
                  returned_status: response.status,
                  partial_operation: true,
                  reported_operation: reported.operation,
                },
              },
            ));
          }
          const headers = new Headers(response.headers);
          headers.set("X-Operational-Warning", references.at(-1) || "");
          if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
          const contentType = headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            try {
              const body = await response.clone().json();
              if (body && typeof body === "object" && !Array.isArray(body)) {
                return Response.json(
                  addOperationalWarnings(body, references),
                  {
                    status: response.status,
                    headers,
                  },
                );
              }
            } catch {
              // Preserve non-standard JSON responses and expose the reference header.
            }
          }
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        }
        return privateNoStore(response);
      } catch (error) {
        if (error instanceof RateLimitError) {
          return Response.json(
            { error: error.message },
            {
              status: 429,
              headers: {
                "Cache-Control": "private, no-store",
                "Retry-After": String(error.retryAfter),
              },
            },
          );
        }
        const message = error instanceof Error ? error.message : "";
        if (/^Forbidden(?::|$)/i.test(message)) {
          return Response.json(
            { error: "You do not have permission to use this feature." },
            { status: 403, headers: { "Cache-Control": "private, no-store" } },
          );
        }
        if (
          profile.classification === "expected-only" &&
          isClearlyExpectedMessage(message)
        ) {
          return Response.json(
            { error: message },
            { status: 400, headers: { "Cache-Control": "private, no-store" } },
          );
        }
        const isUnauthorized = /^Unauthorized$/i.test(message);
        const reference = await captureForRoute(
          request,
          profile,
          isUnauthorized ? new Error("AUTHENTICATION_SESSION_FAILURE") : error,
          affectedRecord,
          {
            severity: isUnauthorized ? "low" : "high",
            provider: failureProvider(error),
          },
        );
        return safeFailure(
          isUnauthorized
            ? "Your session could not be verified."
            : profile.safeMessage || "This operation could not be completed.",
          reference,
          isUnauthorized ? 401 : 500,
        );
      }
    });
  };
}

export function routeMonitoringProfile(
  route: string,
  method: string,
  overrides: Partial<MonitoringProfile> = {},
): MonitoringProfile {
  const feature = route
    .replace(/^\/api\//, "")
    .split("/")
    .filter((part) => !part.startsWith("["))
    .slice(0, 2)
    .join("-") || "api";
  const provider = route.includes("/stripe/")
    ? "stripe"
    : route.includes("/concierge/") || route.includes("/engine/ai")
      ? "openai"
      : route.includes("/media/")
        ? "supabase-storage"
        : route.includes("/location/")
          ? "geocoding"
          : route.includes("/push/")
            ? "web-push"
            : undefined;
  return {
    route,
    method,
    feature,
    actorRole: route.startsWith("/api/admin")
      ? "admin"
      : route.startsWith("/api/salon")
        ? "salon"
        : route.startsWith("/api/customer")
          ? "customer"
          : "public",
    classification: classifyOperationalRoute(route, method),
    safeMessage: "This operation could not be completed.",
    provider,
    ...overrides,
  };
}
