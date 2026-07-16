import { geocodeSalonAddress } from "@/lib/geocodingServer";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "owner-geocode", 8, 10 * 60_000);
    const context = await requireSalonOwner(request);
    if (!context.isOwner) throw new Error("Only the salon owner can update the business address.");
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const salonId = cleanText(body.salon_id, 60) || String(context.salon.id);
    if (salonId !== context.salon.id) throw new Error("You can only geocode your own salon.");
    const result = await geocodeSalonAddress(salonId, { force: body.force === true });
    return Response.json(result);
  } catch (error) {
    console.error("Salon geocoding request failed", error);
    return errorResponse(error, "Unable to verify this salon address.");
  }
}
