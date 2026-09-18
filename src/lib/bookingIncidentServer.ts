import "server-only";
import { capturePlatformError } from "@/lib/platformErrors";
import type { getSupabaseAdmin } from "@/lib/supabaseAdmin";
export const incidentHeaders = { "Cache-Control": "private, no-store" };
export const incidentUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Admin = ReturnType<typeof getSupabaseAdmin>;

export async function readBookingIncident(admin: Admin, salonId: string, bookingId: string) {
  const result = await admin.from("business_booking_incidents")
    .select("id,booking_id,kind,status,occurred_at,evidence,review_reason,reviewed_at")
    .eq("salon_id", salonId).eq("booking_id", bookingId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

export async function incidentFailure(request: Request, error: unknown, admin?: Admin, actorId?: string, salonId?: string) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const status = /Unauthorized/.test(message) ? 401 : /Forbidden|ACCESS_DENIED/.test(message) ? 403 : /NOT_FOUND/.test(message) ? 404 : /CONFLICT|ALREADY_RECORDED|NOT_VERIFIED/.test(message) ? 409 : /INVALID/.test(message) || error instanceof SyntaxError ? 400 : 500;
  const reference = await capturePlatformError({ request, admin, error, actorId, salonId, feature: "booking-attendance", action: request.method, safeMessage: "The attendance record could not be accessed.", severity: status >= 500 ? "high" : "low" });
  return Response.json({ code: /^INCIDENT_[A-Z_]+$/.test(message) ? message : "INCIDENT_UNAVAILABLE", request_id: reference }, { status, headers: { ...incidentHeaders, "X-Request-ID": reference } });
}
