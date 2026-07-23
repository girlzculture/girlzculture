import { geocodeSalonAddress } from "@/lib/geocodingServer";
import { cleanText, enforceRateLimit } from "@/lib/requestSecurity";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireSalonOwner } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  let admin;
  let salonId: string | null = null;
  try {
    enforceRateLimit(request, "owner-geocode", 8, 10 * 60_000);
    const context = await requireSalonOwner(request);
    admin = context.admin;
    if (!context.isOwner) throw new Error("Only the salon owner can update the business address.");
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    salonId = cleanText(body.salon_id, 60) || String(context.salon.id);
    if (salonId !== context.salon.id) throw new Error("You can only geocode your own salon.");
    const result = await geocodeSalonAddress(salonId, { force: body.force === true });
    return Response.json(result);
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "salon-profile", action: "verify-address", actorRole: "salon", salonId, safeMessage: "The address was saved, but its map location could not be verified." });
  }
}
