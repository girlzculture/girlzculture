import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { publicErrorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";

async function GETHandler(request: Request) {
  try {
    const { admin, salon } = await requireSalonOwner(request);
    const result = await admin.rpc("salon_actionable_booking_count", {
      p_salon_id: salon.id,
    });
    if (result.error) throw result.error;
    return Response.json(
      { count: Math.max(0, Number(result.data || 0)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return publicErrorResponse(
      error,
      "The actionable booking count could not be loaded.",
    );
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/salon/actionable-booking-count", "GET", {
    classification: "protected",
    feature: "booking-notifications",
    actorRole: "salon",
    safeMessage: "The actionable booking count could not be loaded.",
  }),
  GETHandler,
);
