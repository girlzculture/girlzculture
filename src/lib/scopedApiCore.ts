export type ScopedApiSession = {
  access_token: string;
  user: { id: string };
};

export type ScopedApiResponseBody = Record<string, unknown>;

export class ScopedApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly recordId: string | null;
  readonly authenticationFailure: boolean;

  constructor(input: {
    message: string;
    status: number;
    code?: string;
    requestId?: string | null;
    recordId?: string | null;
  }) {
    super(input.message);
    this.name = "ScopedApiError";
    this.status = input.status;
    this.code = input.code || `HTTP_${input.status}`;
    this.requestId = input.requestId || null;
    this.recordId = input.recordId || null;
    this.authenticationFailure =
      input.status === 401 ||
      input.code === "AUTHENTICATION_SESSION_FAILURE";
  }
}

type SessionLoader = () => Promise<ScopedApiSession | null>;
type RequestFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function uuid(value: unknown) {
  const text = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text,
  )
    ? text
    : null;
}

async function responseBody(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ScopedApiError({
      message:
        response.status === 401
          ? "Your admin session could not be verified."
          : "The service returned an invalid response. Please try again.",
      status: response.status || 502,
      code:
        response.status === 401
          ? "AUTHENTICATION_SESSION_FAILURE"
          : "NON_JSON_API_RESPONSE",
      requestId: uuid(response.headers.get("x-request-id")),
    });
  }
  try {
    const body = (await response.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("API response is not an object.");
    }
    return body as ScopedApiResponseBody;
  } catch (error) {
    if (error instanceof ScopedApiError) throw error;
    throw new ScopedApiError({
      message: "The service returned an invalid response. Please try again.",
      status: response.status || 502,
      code: "INVALID_JSON_API_RESPONSE",
      requestId: uuid(response.headers.get("x-request-id")),
    });
  }
}

function apiError(response: Response, body: ScopedApiResponseBody) {
  const requestId =
    uuid(body.request_id) || uuid(response.headers.get("x-request-id"));
  const recordId = uuid(body.record_id) || uuid(body.job_id);
  const code = String(body.code || `HTTP_${response.status}`).slice(0, 80);
  const safeMessage =
    typeof body.error === "string" && body.error.trim()
      ? body.error.trim()
      : response.status === 401
        ? "Your admin session could not be verified."
        : response.status === 403
          ? "You do not have permission to use this feature."
          : "This operation could not be completed.";
  return new ScopedApiError({
    message: safeMessage,
    status: response.status,
    code,
    requestId,
    recordId,
  });
}

export async function createScopedJsonApiClient(input: {
  getSession: SessionLoader;
  refreshSession: SessionLoader;
  fetcher?: RequestFetcher;
  scopeLabel?: string;
}) {
  const scopeLabel = input.scopeLabel || "account";
  const requestedWith =
    scopeLabel === "salon"
      ? "GirlzCultureSalon"
      : scopeLabel === "customer"
        ? "GirlzCultureCustomer"
        : "GirlzCultureAdmin";
  const initial = await input.getSession();
  if (!initial) {
    throw new ScopedApiError({
      message: `Your ${scopeLabel} session has expired. Sign in and try again.`,
      status: 401,
      code: "AUTHENTICATION_SESSION_FAILURE",
    });
  }
  const actingUserId = initial.user.id;
  let session = initial;
  const fetcher = input.fetcher || fetch;

  async function verifiedSession(forceRefresh: boolean) {
    const candidate = forceRefresh
      ? await input.refreshSession()
      : await input.getSession();
    if (!candidate || candidate.user.id !== actingUserId) {
      throw new ScopedApiError({
        message:
          candidate && candidate.user.id !== actingUserId
            ? `The signed-in ${scopeLabel} account changed during this operation. Start again.`
            : `Your ${scopeLabel} session has expired. Sign in and try again.`,
        status: 401,
        code: "AUTHENTICATION_SESSION_FAILURE",
      });
    }
    session = candidate;
    return candidate;
  }

  async function request<T extends ScopedApiResponseBody = ScopedApiResponseBody>(
    target: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<T> {
    let refreshed = false;
    while (true) {
      session = await verifiedSession(refreshed);
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);
      headers.set("Accept", "application/json");
      headers.set("X-Requested-With", requestedWith);
      const response = await fetcher(target, {
        ...init,
        headers,
        credentials: "same-origin",
        cache: init.cache || "no-store",
        redirect: "manual",
      });
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        continue;
      }
      const body = await responseBody(response);
      if (!response.ok) throw apiError(response, body);
      return body as T;
    }
  }

  return {
    actingUserId,
    request,
  };
}

export function scopedApiErrorMessage(
  error: unknown,
  fallback: string,
  recordId?: string | null,
) {
  if (!(error instanceof ScopedApiError)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  const reference = error.requestId
    ? ` Reference ${error.requestId}.`
    : "";
  const connectedRecord = recordId || error.recordId;
  const job = connectedRecord ? ` Video job ${connectedRecord}.` : "";
  const base = error.message.replace(
    /\s*(?:Please try again or contact support with reference|Reference)\s+[0-9a-f-]{36}\.?/gi,
    "",
  ).trim();
  return `${base}${reference}${job}`.trim();
}
