/** Only stable codes and the server's exact incident reference cross into UI.
 * Raw English/provider/SQL error messages are never used as interface copy. */
export class OwnerActionError extends Error {
  constructor(public code: string, public reference = "") { super(code); }
}
export function ownerResponseError(body: { code?: unknown; request_id?: unknown }, fallback: string) {
  return new OwnerActionError(typeof body.code === "string" ? body.code : fallback,
    typeof body.request_id === "string" ? body.request_id : "");
}
