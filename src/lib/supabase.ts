import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { shouldCaptureProviderResponse } from "@/lib/operationalMonitoringCore";
import { shouldPreserveSupabaseAuthResponse } from "@/lib/supabaseFetchPolicy";
import {
  buildAuthStorageKeys,
  buildLegacyAuthStorageKeys,
  classifySupabaseAuthFailure,
  createScopedRefreshCoordinator,
  isStoredSessionShape,
  type AuthScopeName,
} from "@/lib/authSessionCore";
import { ScopedSessionProviderError } from "@/lib/scopedApiCore";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!rawSupabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabaseUrl = rawSupabaseUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const resolvedSupabaseAnonKey: string = supabaseAnonKey;

export const AUTH_STORAGE_KEYS = buildAuthStorageKeys(supabaseUrl);
const LEGACY_AUTH_STORAGE_KEYS = buildLegacyAuthStorageKeys(supabaseUrl);

function providerOperation(input: RequestInfo | URL) {
  try {
    const pathname = new URL(
      input instanceof Request ? input.url : String(input),
    ).pathname;
    const match = pathname.match(
      /^\/(?:rest\/v1|auth\/v1|storage\/v1)\/([^/?]+)/,
    );
    const surface = pathname.startsWith("/auth/v1/")
      ? "auth"
      : pathname.startsWith("/storage/v1/")
        ? "storage"
        : "database";
    const resource = String(match?.[1] || "request")
      .replace(/[^a-z0-9_.-]/gi, "")
      .slice(0, 60);
    return `${surface}:${resource || "request"}`;
  } catch {
    return "client-provider-request";
  }
}

function requestAuthorization(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(
    init?.headers || (input instanceof Request ? input.headers : undefined),
  );
  const value = headers.get("authorization") || "";
  return /^Bearer\s+\S+$/i.test(value) ? value : "";
}

export async function reportClientOperationalFailure(values: {
  status: number;
  code: string;
  operation: string;
  provider?: "supabase" | "supabase-realtime" | "google-maps" | "web-push" | "service-worker";
  authorization?: string;
  dedupeScope?: string;
}) {
  const fallback = {
    reference: null,
    message: "This operation could not be completed. Please try again.",
  };
  const page = typeof window === "undefined" ? "" : window.location.pathname;
  const dedupeKey = [
    values.dedupeScope || "shared",
    values.provider || "supabase",
    values.operation,
    values.status,
    values.code,
    page,
  ].join("|");
  const existing = clientFailureReports.get(dedupeKey);
  if (existing && Date.now() - existing.startedAt < CLIENT_FAILURE_DEDUPE_MS) {
    return existing.promise;
  }
  const promise = (async () => {
    try {
      const response = await fetch("/api/monitor/client-provider", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(values.authorization
            ? { Authorization: values.authorization }
            : {}),
        },
        body: JSON.stringify({
          status: values.status,
          code: values.code,
          operation: values.operation,
          provider: values.provider || "supabase",
          page,
        }),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "manual",
      });
      const contentType = response.headers.get("content-type") || "";
      if (
        !response.ok ||
        response.type === "opaqueredirect" ||
        !contentType.toLowerCase().includes("application/json")
      ) {
        return fallback;
      }
      const body = await response.json() as { request_id?: string; error?: string };
      const reference = /^[0-9a-f-]{36}$/i.test(String(body.request_id || ""))
        ? String(body.request_id)
        : null;
      return {
        reference,
        message: typeof body.error === "string" && body.error
          ? body.error
          : reference
            ? `This operation could not be completed. Please try again or contact support with reference ${reference}.`
            : fallback.message,
      };
    } catch {
      return fallback;
    }
  })();
  clientFailureReports.set(dedupeKey, {
    startedAt: Date.now(),
    promise,
  });
  return promise;
}

const CLIENT_FAILURE_DEDUPE_MS = 5 * 60_000;
const clientFailureReports = new Map<
  string,
  {
    startedAt: number;
    promise: Promise<{ reference: string | null; message: string }>;
  }
>();

async function monitoredBrowserSupabaseFetch(
  scope: AuthScopeName,
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    void reportClientOperationalFailure({
      status: 503,
      code:
        error instanceof DOMException && error.name === "TimeoutError"
          ? "TIMEOUT"
          : "NETWORK",
      operation: `${providerOperation(input)}:${scope}`,
      provider: "supabase",
      authorization: requestAuthorization(input, init),
      dedupeScope: scope,
    });
    throw error;
  }
  if (response.ok || typeof window === "undefined") return response;
  let code = "";
  let message = "";
  try {
    const payload = await response.clone().json() as Record<string, unknown>;
    code = String(payload.code || payload.error_code || "").slice(0, 80);
    message = String(payload.message || payload.msg || payload.error || "")
      .slice(0, 300);
  } catch {
    // Provider response bodies are not retained.
  }
  const isAuthResponse = shouldPreserveSupabaseAuthResponse(input);
  if (
    isAuthResponse &&
    classifySupabaseAuthFailure({
      status: response.status,
      code,
      message,
    }) === "terminal"
  ) {
    // The protected API route supplies the canonical incident reference for
    // an invalid session. Reporting the same rejected JWT here on every
    // background refresh would create a second, noisy client incident.
    return response;
  }
  if (!shouldCaptureProviderResponse(response.status, code, message)) {
    return response;
  }
  const reportPromise = reportClientOperationalFailure({
    status: response.status,
    code: /^[A-Z0-9_.:-]{1,80}$/i.test(code)
      ? code
      : `HTTP_${response.status}`,
    operation: `${providerOperation(input)}:${scope}`,
    provider: "supabase",
    authorization: requestAuthorization(input, init),
    dedupeScope: scope,
  });
  // Supabase Auth owns token refresh, session recovery, MFA and confirmation
  // response parsing. Rewriting those responses can turn a temporary provider
  // error into a false sign-out. Capture the incident asynchronously and let
  // the Auth client receive the original response unchanged.
  if (isAuthResponse) {
    void reportPromise;
    return response;
  }
  const report = await reportPromise;
  const reference = report.reference;
  const safeMessage = report.message;
  return Response.json(
    {
      code: code || `HTTP_${response.status}`,
      message: safeMessage,
      msg: safeMessage,
      error: safeMessage,
      request_id: reference,
    },
    {
      status: response.status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-ID": reference || "",
      },
    },
  );
}

function createBrowserClient(scope: AuthScopeName, storageKey: string) {
  return createClient(supabaseUrl, resolvedSupabaseAnonKey, {
    auth: {
      storageKey,
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
      // Only the customer client processes confirmation links. Salon/admin
      // credentials are issued by their dedicated secure-login surfaces.
      detectSessionInUrl: scope === "customer" && typeof window !== "undefined",
    },
    global: {
      fetch: (input, init) => monitoredBrowserSupabaseFetch(scope, input, init),
    },
  });
}

// Each product area has an independent browser session. Signing into the
// platform admin never replaces a salon owner's session (and vice versa).
export const supabase = createBrowserClient("customer", AUTH_STORAGE_KEYS.customer);
export const salonSupabase = createBrowserClient("salon", AUTH_STORAGE_KEYS.salon);
export const adminSupabase = createBrowserClient("admin", AUTH_STORAGE_KEYS.admin);

export type AuthScope = keyof typeof AUTH_STORAGE_KEYS;
const scopedRefreshes =
  createScopedRefreshCoordinator<AuthScope, Session | null>();
const scopedMigrations: Partial<
  Record<AuthScope, Promise<Session | null>>
> = {};
const completedLegacyMigrationChecks = new Set<AuthScope>();

export function getSupabaseForScope(scope: AuthScope = "customer"): SupabaseClient {
  if (scope === "admin") return adminSupabase;
  if (scope === "salon") return salonSupabase;
  return supabase;
}

function clearStoredAuthKey(storageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(`${storageKey}-user`);
    window.localStorage.removeItem(`${storageKey}-code-verifier`);
  } catch {
    // Storage can be unavailable in restricted/private browser contexts. The
    // in-memory auth client is still signed out by clearSessionForScope.
  }
}

function legacyStoredSession(storageKey: string): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    return isStoredSessionShape(parsed) ? (parsed as Session) : null;
  } catch {
    return null;
  }
}

function expectedDestinationRole(scope: AuthScope) {
  if (scope === "admin") return "admin";
  if (scope === "salon") return "salon_owner";
  return "customer";
}

async function destinationRole(accessToken: string) {
  let response: Response;
  try {
    response = await fetch("/api/auth/destination", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "X-Requested-With": "GirlzCultureAuthMigration",
      },
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
    });
  } catch {
    throw new ScopedSessionProviderError();
  }
  if (
    response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400)
  ) {
    throw new ScopedSessionProviderError();
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ScopedSessionProviderError();
  }
  let body: { role?: string };
  try {
    body = (await response.json()) as { role?: string };
  } catch {
    throw new ScopedSessionProviderError();
  }
  if (response.status === 401) return { kind: "terminal" as const, role: null };
  if (response.status === 403) {
    return { kind: "role-mismatch" as const, role: body.role || null };
  }
  if (!response.ok) throw new ScopedSessionProviderError();
  return { kind: "valid" as const, role: body.role || null };
}

async function refreshLegacySession(
  scope: AuthScope,
  session: Session,
): Promise<Session | null> {
  const ephemeral = createClient(supabaseUrl, resolvedSupabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => monitoredBrowserSupabaseFetch(scope, input, init),
    },
  });
  try {
    const { data, error } = await ephemeral.auth.refreshSession({
      refresh_token: session.refresh_token,
    });
    if (error) {
      if (classifySupabaseAuthFailure(error) === "transient") {
        throw new ScopedSessionProviderError(scope);
      }
      return null;
    }
    return data.session;
  } catch (error) {
    if (error instanceof ScopedSessionProviderError) throw error;
    throw new ScopedSessionProviderError(scope);
  }
}

async function migrateLegacySession(scope: AuthScope): Promise<Session | null> {
  if (typeof window === "undefined") return null;
  const scopedClient = getSupabaseForScope(scope);
  for (const legacyKey of LEGACY_AUTH_STORAGE_KEYS[scope]) {
    let candidate = legacyStoredSession(legacyKey);
    if (!candidate) continue;
    let destination = await destinationRole(candidate.access_token);
    if (destination.kind === "terminal") {
      candidate = await refreshLegacySession(scope, candidate);
      if (!candidate) {
        clearStoredAuthKey(legacyKey);
        continue;
      }
      destination = await destinationRole(candidate.access_token);
    }
    if (
      destination.kind !== "valid" ||
      destination.role !== expectedDestinationRole(scope)
    ) {
      continue;
    }
    const { data, error } = await scopedClient.auth.setSession({
      access_token: candidate.access_token,
      refresh_token: candidate.refresh_token,
    });
    if (error || !data.session) {
      if (error && classifySupabaseAuthFailure(error) === "transient") {
        throw new ScopedSessionProviderError(scope);
      }
      continue;
    }
    // Remove only the validated source key after the role-scoped copy is
    // durable. No admin/salon/customer destination key is ever touched here.
    clearStoredAuthKey(legacyKey);
    return data.session;
  }
  return null;
}

// Existing installations used unversioned storage keys. A candidate legacy
// session is authenticated and role-checked by the server before being copied
// to the project/version-scoped destination key.
export async function getSessionForScope(scope: AuthScope): Promise<Session | null> {
  const scopedClient = getSupabaseForScope(scope);
  const { data: scopedData, error } = await scopedClient.auth.getSession();
  if (error) {
    if (classifySupabaseAuthFailure(error) === "transient") {
      throw new ScopedSessionProviderError(scope);
    }
    await clearSessionForScope(scope);
    return null;
  }
  if (scopedData.session || typeof window === "undefined") return scopedData.session;
  if (completedLegacyMigrationChecks.has(scope)) return null;
  if (scopedMigrations[scope]) return scopedMigrations[scope] || null;
  const migration = migrateLegacySession(scope)
    .then((session) => {
      completedLegacyMigrationChecks.add(scope);
      return session;
    })
    .finally(() => {
      delete scopedMigrations[scope];
    });
  scopedMigrations[scope] = migration;
  return migration;
}

export async function reportClientOperationalRecovery(values: {
  operation: string;
  provider?: "supabase-realtime";
  authorization: string;
}) {
  if (!values.authorization) return { resolved: 0 };
  try {
    const response = await fetch("/api/monitor/client-provider", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: values.authorization,
      },
      body: JSON.stringify({
        status: 200,
        code: "REALTIME_RECOVERED",
        operation: values.operation,
        provider: values.provider || "supabase-realtime",
        page: typeof window === "undefined" ? "" : window.location.pathname,
      }),
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
    });
    const contentType = response.headers.get("content-type") || "";
    if (
      !response.ok ||
      response.type === "opaqueredirect" ||
      !contentType.toLowerCase().includes("application/json")
    ) {
      return { resolved: 0 };
    }
    const body = await response.json() as { resolved?: number };
    for (const key of clientFailureReports.keys()) {
      if (
        key.includes(`|${values.provider || "supabase-realtime"}|`) &&
        key.includes(`|${values.operation}|`)
      ) {
        clientFailureReports.delete(key);
      }
    }
    return { resolved: Math.max(0, Number(body.resolved || 0)) };
  } catch {
    // Recovery reporting must never affect the recovered dashboard.
    return { resolved: 0 };
  }
}

export async function clearSessionForScope(scope: AuthScope) {
  const client = getSupabaseForScope(scope);
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // A bad JWT can make provider-side sign-out reject. The affected scoped
    // browser key is still cleared below; no other role key is touched.
  } finally {
    clearStoredAuthKey(AUTH_STORAGE_KEYS[scope]);
  }
}

export async function refreshSessionForScope(
  scope: AuthScope,
): Promise<Session | null> {
  return scopedRefreshes.run(scope, async () => {
    const scopedClient = getSupabaseForScope(scope);
    try {
      const { data, error } = await scopedClient.auth.refreshSession();
      if (error || !data.session) {
        if (
          error &&
          classifySupabaseAuthFailure(error) === "transient"
        ) {
          throw new ScopedSessionProviderError(scope);
        }
        await clearSessionForScope(scope);
        return null;
      }
      return data.session;
    } catch (error) {
      if (error instanceof ScopedSessionProviderError) throw error;
      throw new ScopedSessionProviderError(scope);
    }
  });
}

export async function getValidSessionForScope(
  scope: AuthScope,
  minimumValiditySeconds = 60,
): Promise<Session | null> {
  const session = await getSessionForScope(scope);
  if (!session) return null;
  const expiresAt = Number(session.expires_at || 0);
  if (
    expiresAt > 0 &&
    expiresAt * 1_000 <= Date.now() + minimumValiditySeconds * 1_000
  ) {
    return refreshSessionForScope(scope);
  }
  return session;
}
