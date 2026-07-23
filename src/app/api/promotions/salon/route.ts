import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit } from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isPromotionActive, type SalonPromotion } from "@/lib/salonPromotions";
import { monitoredRouteFailure } from "@/lib/platformErrors";

async function GETHandler(request: Request) {
  const admin = getSupabaseAdmin();
  let salonId: string | null = null;
  try {
    enforceRateLimit(request, "salon-promotion-preview", 30, 60_000);
    const search = new URL(request.url).searchParams;
    const id = cleanText(search.get("id"), 50);
    salonId = cleanText(search.get("salon_id"), 50);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(salonId)) return Response.json({ error: "Choose a valid salon offer." }, { status: 400 });
    const salon = await admin.from("salons").select("id,status,is_discoverable,subscription_tier").eq("id", salonId).maybeSingle();
    if (salon.error) throw salon.error;
    if (!salon.data || salon.data.status !== "Active" || salon.data.is_discoverable !== true || !["Growth","Premium"].includes(String(salon.data.subscription_tier || ""))) return Response.json({ error: "This salon offer is not available." }, { status: 404 });
    const result = await admin.from("salon_promotions").select("id,salon_id,title,description,public_headline,promotion_type,discount_value,discount_label,status,target_scope,target_ids,restrictions,starts_at,ends_at,is_active,archived_at").eq("id", id).eq("salon_id", salonId).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data || !isPromotionActive(result.data as SalonPromotion)) return Response.json({ error: "This salon offer has ended or is paused." }, { status: 404 });
    return Response.json({ promotion: result.data }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "promotions", action: "load-public-offer", actorRole: "public", salonId, safeMessage: "We couldn't load this salon offer." });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/promotions/salon", "GET"), GETHandler);
