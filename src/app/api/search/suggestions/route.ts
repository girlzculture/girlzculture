import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    enforceRateLimit(request, "search-suggestions", 120, 10 * 60_000);
    const query = new URL(request.url).searchParams;
    const type = cleanText(query.get("type"), 20);
    const term = cleanText(query.get("q"), 80).toLowerCase();
    if (type !== "style") return Response.json({ suggestions: [], groups: [] });
    const admin = getSupabaseAdmin();
    const pattern = `${term.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const [{ data: master, error: masterError }, { data: salons, error: salonError }, { data: markets, error: marketError }] = await Promise.all([
      admin.from("master_styles").select("name").eq("is_active", true).ilike("name", pattern).order("sort_order").limit(8),
      admin.from("salons").select("name,slug,address_city,address_state,borough").eq("status", "Active").eq("is_discoverable", true).in("subscription_status", ["active", "trialing"]).ilike("name", pattern).order("name").limit(6),
      admin.from("location_markets").select("name,state_code,center_latitude,center_longitude").eq("is_active", true).ilike("name", pattern).order("name").limit(5),
    ]);
    if (masterError) throw masterError;
    if (salonError) throw salonError;
    if (marketError) throw marketError;
    const styleItems = [...new Map((master || []).map((row) => [String(row.name || "").trim().toLowerCase(), String(row.name || "").trim()])).values()].filter(Boolean).map((label) => ({ kind: "style", label, value: label }));
    const salonItems = (salons || []).map((salon) => ({ kind: "salon", label: String(salon.name || "Salon"), subtitle: [salon.borough || salon.address_city, salon.address_state].filter(Boolean).join(", "), href: `/salon/${salon.slug}` }));
    const locationItems = (markets || []).map((market) => ({ kind: "location", label: `${market.name}, ${market.state_code}`, value: `${market.name}, ${market.state_code}`, lat: Number(market.center_latitude), lng: Number(market.center_longitude) }));
    const groups = [
      { kind: "style", label: "Styles", items: styleItems },
      { kind: "salon", label: "Salons", items: salonItems },
      { kind: "location", label: "Locations", items: locationItems },
    ].filter((group) => group.items.length);
    return Response.json({ suggestions: styleItems.map((item) => item.label), groups });
  } catch (error) {
    console.error("Search suggestion load failed", error);
    return errorResponse(error, "Unable to load suggestions");
  }
}
