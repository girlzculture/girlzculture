/** Only stable codes and the server's exact incident reference cross into UI.
 * Raw English/provider/SQL error messages are never used as interface copy. */
export class OwnerActionError extends Error {
  constructor(public code: string, public reference = "") { super(code); }
}
export function ownerResponseError(body: { code?: unknown; request_id?: unknown }, fallback: string) {
  return new OwnerActionError(typeof body.code === "string" ? body.code : fallback,
    typeof body.request_id === "string" ? body.request_id : "");
}

/** Preserve correlation even if an upstream failure replaces the JSON body. */
export async function readOwnerResponse(response: Response, fallback: string) {
  const reference = response.headers.get("X-Request-ID") || "";
  let body;
  try { body = await response.json(); } catch { throw new OwnerActionError(fallback, reference); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new OwnerActionError(fallback, reference);
  if (!response.ok) throw ownerResponseError({ ...body, request_id: typeof body.request_id === "string" && body.request_id ? body.request_id : reference }, fallback);
  return body;
}
