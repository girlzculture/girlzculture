export type ApiResponseBody = Record<string, unknown> & {
  error?: string;
  request_id?: string;
  reference?: string;
};

function safeReference(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(normalized)
    ? normalized
    : "";
}

function fallbackBody(
  response: Response,
  fallbackMessage: string,
  bodyReference?: unknown,
): ApiResponseBody {
  // X-Nf-Request-Id identifies Netlify's edge request, not an Engine event.
  // It is intentionally never promoted into the support-reference field on
  // its own. A canonical application reference is supplied in the JSON body
  // and/or X-Request-ID by safeFailure().
  const reference =
    safeReference(bodyReference) ||
    safeReference(response.headers.get("x-request-id"));
  return {
    error: reference
      ? `${fallbackMessage} Reference ${reference}.`
      : fallbackMessage,
    ...(reference ? { request_id: reference, reference } : {}),
  };
}

/**
 * Parses an application API response without ever leaking an HTML edge error
 * (or a raw provider/database payload) into the interface.
 */
export async function readApiResponse(
  response: Response,
  fallbackMessage = "The request could not be completed.",
): Promise<ApiResponseBody> {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/json")) {
    return fallbackBody(response, fallbackMessage);
  }
  try {
    const value = (await response.json()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return fallbackBody(response, fallbackMessage);
    const body = value as ApiResponseBody;
    if (!response.ok && typeof body.error !== "string") {
      return {
        ...body,
        ...fallbackBody(
          response,
          fallbackMessage,
          body.reference || body.request_id,
        ),
      };
    }
    return body;
  } catch {
    return fallbackBody(response, fallbackMessage);
  }
}
