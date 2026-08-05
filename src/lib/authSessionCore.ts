export type AuthScopeName = "customer" | "salon" | "admin";

export const AUTH_STORAGE_SCHEMA_VERSION = 2;

export const LEGACY_AUTH_STORAGE_KEYS: Record<AuthScopeName, readonly string[]> = {
  customer: ["supabase-default-auth"],
  salon: ["girlz-culture-salon-auth", "supabase-default-auth"],
  admin: ["girlz-culture-admin-auth", "supabase-default-auth"],
};

export function supabaseProjectNamespace(rawUrl: string) {
  try {
    const hostname = new URL(rawUrl.replace(/\/rest\/v1\/?$/i, "")).hostname
      .toLowerCase();
    const projectRef = hostname.endsWith(".supabase.co")
      ? hostname.split(".")[0]
      : hostname;
    const safe = projectRef.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    return safe.slice(0, 63) || "unknown-project";
  } catch {
    return "unknown-project";
  }
}

export function buildAuthStorageKeys(rawUrl: string) {
  const project = supabaseProjectNamespace(rawUrl);
  const prefix = `girlz-culture-auth-v${AUTH_STORAGE_SCHEMA_VERSION}-${project}`;
  return {
    customer: `${prefix}-customer`,
    salon: `${prefix}-salon`,
    admin: `${prefix}-admin`,
  } as const;
}

/**
 * Supabase JS used `sb-<project-ref>-auth-token` when no explicit storage key
 * was configured. Include that real key in the one-time migration list so an
 * existing customer session survives the scoped-session rollout. A candidate
 * is still authenticated and role-checked before it is copied.
 */
export function buildLegacyAuthStorageKeys(rawUrl: string) {
  const supabaseDefaultKey = `sb-${supabaseProjectNamespace(rawUrl)}-auth-token`;
  return {
    customer: [supabaseDefaultKey, ...LEGACY_AUTH_STORAGE_KEYS.customer],
    salon: [...LEGACY_AUTH_STORAGE_KEYS.salon, supabaseDefaultKey],
    admin: [...LEGACY_AUTH_STORAGE_KEYS.admin, supabaseDefaultKey],
  } satisfies Record<AuthScopeName, readonly string[]>;
}

type AuthFailureInput = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  name?: unknown;
};

export type SupabaseAuthFailureKind = "terminal" | "transient";

const DEFAULT_TRANSIENT_AUTH_RETRY_DELAYS_MS = [150, 600] as const;

type TransientAuthRetryOptions = {
  delaysMs?: readonly number[];
  wait?: (delayMs: number) => Promise<void>;
  random?: () => number;
};

/**
 * Auth failures must be split before the UI decides whether to discard a
 * session. Invalid/expired credentials are terminal. Provider throttling,
 * outages, timeouts and transport failures are transient and must preserve
 * the browser session for a later retry.
 */
export function classifySupabaseAuthFailure(
  input: AuthFailureInput | null | undefined,
): SupabaseAuthFailureKind {
  const status = Number(input?.status || 0);
  const code = String(input?.code || "").trim().toLowerCase();
  const message = String(input?.message || "").trim().toLowerCase();
  const name = String(input?.name || "").trim().toLowerCase();
  const combined = `${code} ${message} ${name}`;

  if (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    /\b(timeout|timed out|network|fetch failed|econn|enotfound|socket|temporarily unavailable|service unavailable|overloaded)\b/.test(
      combined,
    )
  ) {
    return "transient";
  }

  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    /\b(bad_jwt|invalid[_ -]?jwt|invalid[_ -]?token|jwt expired|token expired|session_not_found|session missing|refresh_token_not_found|refresh token.*(?:invalid|expired|missing)|invalid_grant|user_not_found)\b/.test(
      combined,
    )
  ) {
    return "terminal";
  }

  // Unknown Auth failures are preserved. It is safer to retry a temporarily
  // unavailable provider than to destroy a valid role-scoped session.
  return "transient";
}

/**
 * A short provider or network interruption must not turn a still-recoverable
 * persisted session into a sign-out. Retry only failures classified as
 * transient, keep the retry budget bounded, and add jitter so many resumed
 * browser tabs do not all retry Supabase Auth at the same instant.
 */
export async function retryTransientAuthOperation<T>(
  operation: (attempt: number) => Promise<T>,
  options: TransientAuthRetryOptions = {},
): Promise<T> {
  const delays = options.delaysMs || DEFAULT_TRANSIENT_AUTH_RETRY_DELAYS_MS;
  const wait = options.wait || ((delayMs: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const random = options.random || Math.random;
  let attempt = 0;
  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (
        classifySupabaseAuthFailure(
          error && typeof error === "object"
            ? (error as AuthFailureInput)
            : { message: error },
        ) !== "transient" ||
        attempt >= delays.length
      ) {
        throw error;
      }
      const baseDelay = Math.max(0, Number(delays[attempt] || 0));
      const jitterRatio = Math.max(0, Math.min(1, Number(random()) || 0));
      const delay = baseDelay + Math.floor(baseDelay * 0.5 * jitterRatio);
      attempt += 1;
      await wait(delay);
    }
  }
}

export function isStoredSessionShape(value: unknown): value is {
  access_token: string;
  refresh_token: string;
  user: { id: string };
  expires_at?: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const user =
    record.user && typeof record.user === "object" && !Array.isArray(record.user)
      ? (record.user as Record<string, unknown>)
      : null;
  return (
    typeof record.access_token === "string" &&
    record.access_token.length > 20 &&
    typeof record.refresh_token === "string" &&
    record.refresh_token.length > 10 &&
    typeof user?.id === "string" &&
    /^[0-9a-f-]{36}$/i.test(user.id)
  );
}

export function createScopedRefreshCoordinator<
  TScope extends string,
  TResult,
>() {
  const active = new Map<TScope, Promise<TResult>>();
  return {
    run(scope: TScope, operation: () => Promise<TResult>) {
      const existing = active.get(scope);
      if (existing) return existing;
      const current = operation().finally(() => {
        if (active.get(scope) === current) active.delete(scope);
      });
      active.set(scope, current);
      return current;
    },
    has(scope: TScope) {
      return active.has(scope);
    },
  };
}

export function scopedStorageEntries(
  scope: AuthScopeName,
  keys: Record<AuthScopeName, string>,
) {
  const key = keys[scope];
  return [key, `${key}-user`, `${key}-code-verifier`] as const;
}
