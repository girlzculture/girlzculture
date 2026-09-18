import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { capturePlatformError } from "@/lib/platformErrors";
import { CLIENT_PERMISSIONS, type ClientCard, clientUuid } from "@/lib/businessClientCore";
export type ClientContext = Awaited<ReturnType<typeof requireSalonOwner>>;
export const clientHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const failureCodes = new Set(["CLIENT_UNAUTHENTICATED", "CLIENT_ACCESS_DENIED", "CLIENT_NOT_FOUND", "CLIENT_NOT_VERIFIED", "CLIENT_INVALID", "CLIENT_INVALID_IMAGE", "CLIENT_CHANGED", "CLIENT_REQUEST_CONFLICT", "CLIENT_PHOTO_LIMIT", "CLIENT_PHOTO_NOT_UPLOADED", "CLIENT_PHOTO_UPLOAD_FAILED", "CLIENT_PHOTO_DELETE_FAILED", "CLIENT_PHOTO_UNAVAILABLE", "CLIENT_LINK_LIMIT", "CLIENT_ALREADY_LINKED", "CLIENT_IDENTITY_CONFLICT"]);
export async function readBusinessClientCard(context: ClientContext, bookingId: string): Promise<ClientCard> {
  if (!clientUuid.test(bookingId)) throw Error("CLIENT_INVALID");
  const result = await context.admin.rpc("read_business_client_card", { p_salon: context.salon.id, p_actor: context.user.id, p_booking: bookingId });
  if (result.error) throw result.error;
  const data = result.data as ClientCard;
  if (!data || data.booking_id !== bookingId || !Number.isInteger(data.revision) || !data.permissions || CLIENT_PERMISSIONS.some(key => typeof data.permissions[key] !== "boolean") || !Array.isArray(data.visits) || !Array.isArray(data.photos)) throw Error("CLIENT_NOT_VERIFIED");
  return data;
}
export async function clientFailure(request: Request, error: unknown, context?: ClientContext) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const candidate = message.match(/\bCLIENT_[A-Z_]+\b/)?.[0];
  const code = candidate && failureCodes.has(candidate) ? candidate : (/Unauthorized/.test(message) ? "CLIENT_UNAUTHENTICATED" : /Forbidden/.test(message) ? "CLIENT_ACCESS_DENIED" : "CLIENT_UNAVAILABLE");
  const status = code === "CLIENT_UNAUTHENTICATED" ? 401 : code === "CLIENT_ACCESS_DENIED" ? 403 : code === "CLIENT_NOT_FOUND" ? 404 : /CHANGED|CONFLICT|LIMIT|ALREADY_LINKED/.test(code) ? 409 : /INVALID/.test(code) || error instanceof SyntaxError ? 400 : 500;
  // A database error can include the rejected private notes/formula. Record
  // only the allowlisted code, never original error bodies or client payloads.
  const reference = await capturePlatformError({ request, admin: context?.admin, error: new Error(code), actorId: context?.user.id, salonId: context?.salon.id, feature: "business-client-record", action: request.method, safeMessage: "The client record could not be accessed.", severity: status >= 500 ? "high" : "low" });
  return Response.json({ code, request_id: reference }, { status, headers: { ...clientHeaders, "X-Request-ID": reference } });
}
