import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { shouldCaptureProviderResponse } from "@/lib/operationalMonitoringCore";
import { shouldPreserveSupabaseAuthResponse } from "@/lib/supabaseFetchPolicy";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!rawSupabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabaseUrl = rawSupabaseUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const resolvedSupabaseAnonKey: string = supabaseAnonKey;

export const AUTH_STORAGE_KEYS = {
  customer: "supabase-default-auth",
  salon: "girlz-culture-salon-auth",
  admin: "girlz-culture-admin-auth",
} as const;

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
}) {
  try {
    const response = await fetch("/api/monitor/client-provider", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(values.authorization
          ? { Authorization: values.authorization }
          : {}),
      },
      body: JSON.stringify({
        status: values.status,
        code: values.code,
        operation: values.operation,
        provider: values.provider || "supabase",
        page: typeof window === "undefined" ? "" : window.location.pathname,
      }),
      cache: "no-store",
    });
    if (!response.ok) return { reference: null, message: "This operation could not be completed. Please try again." };
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
          : "This operation could not be completed. Please try again.",
    };
  } catch {
    return {
      reference: null,
      message: "This operation could not be completed. Please try again.",
    };
  }
}

async function monitoredBrowserSupabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const response = await fetch(input, init);
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
  if (!shouldCaptureProviderResponse(response.status, code, message)) {
    return response;
  }
  const reportPromise = reportClientOperationalFailure({
    status: response.status,
    code: /^[A-Z0-9_.:-]{1,80}$/i.test(code)
      ? code
      : `HTTP_${response.status}`,
    operation: providerOperation(input),
    provider: "supabase",
    authorization: requestAuthorization(input, init),
  });
  // Supabase Auth owns token refresh, session recovery, MFA and confirmation
  // response parsing. Rewriting those responses can turn a temporary provider
  // error into a false sign-out. Capture the incident asynchronously and let
  // the Auth client receive the original response unchanged.
  if (shouldPreserveSupabaseAuthResponse(input)) {
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

function createBrowserClient(storageKey?: string) {
  return createClient(supabaseUrl, resolvedSupabaseAnonKey, {
    auth: {
      ...(storageKey ? { storageKey } : {}),
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
      // Only the legacy/customer client processes confirmation links. The
      // verified role is then migrated to the matching scoped client.
      detectSessionInUrl: !storageKey && typeof window !== "undefined",
    },
    global: {
      fetch: monitoredBrowserSupabaseFetch,
    },
  });
}

// Each product area has an independent browser session. Signing into the
// platform admin never replaces a salon owner's session (and vice versa).
export const supabase = createBrowserClient();
export const salonSupabase = createBrowserClient(AUTH_STORAGE_KEYS.salon);
export const adminSupabase = createBrowserClient(AUTH_STORAGE_KEYS.admin);

export type AuthScope = keyof typeof AUTH_STORAGE_KEYS;
export function getSupabaseForScope(scope: AuthScope = "customer"): SupabaseClient {
  if (scope === "admin") return adminSupabase;
  if (scope === "salon") return salonSupabase;
  return supabase;
}

// Existing installations used Supabase's default session key for every role.
// Migrate a matching legacy role into its dedicated client once, without
// signing out or altering the other role's session.
export async function getSessionForScope(scope: AuthScope): Promise<Session | null> {
  const scopedClient = getSupabaseForScope(scope);
  const { data: scopedData } = await scopedClient.auth.getSession();
  if (scopedData.session || scope === "customer" || typeof window === "undefined") return scopedData.session;
  const { data: legacyData } = await supabase.auth.getSession();
  const legacySession = legacyData.session;
  if (!legacySession) return null;
  try {
    const response = await fetch("/api/auth/destination", { method: "POST", headers: { Authorization: `Bearer ${legacySession.access_token}` } });
    const destination = await response.json() as { role?: string };
    const expectedRole = scope === "admin" ? "admin" : "salon_owner";
    if (!response.ok || destination.role !== expectedRole) return null;
    const { data } = await scopedClient.auth.setSession({ access_token: legacySession.access_token, refresh_token: legacySession.refresh_token });
    return data.session;
  } catch {
    // The protected destination route owns server-side incident monitoring.
    // Never expose session/provider details in a browser log.
    return null;
  }
}
