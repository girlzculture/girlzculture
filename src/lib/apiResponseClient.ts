export type ApiResponseBody = Record<string, unknown> & {
  error?: string;
  request_id?: string;
  reference?: string;
};

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
    const reference =
      response.headers.get("x-request-id") ||
      response.headers.get("x-nf-request-id") ||
      "";
    return {
      error: reference
        ? `${fallbackMessage} Reference ${reference}.`
        : fallbackMessage,
      ...(reference ? { request_id: reference, reference } : {}),
    };
  }
  try {
    const value = (await response.json()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { error: fallbackMessage };
    return value as ApiResponseBody;
  } catch {
    return { error: fallbackMessage };
  }
}
