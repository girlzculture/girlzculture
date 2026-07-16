import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

const ALLOWED_SORTS = new Set(["name","rating","reviews","status","distance"]);
const ALLOWED_DIRECTIONS = new Set(["asc","desc"]);

function optionalNumber(value: string | null) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "salons");
    const search = new URL(request.url).searchParams;
    const page = Math.max(1, Math.round(Number(search.get("page") || 1)));
    const pageSize = Math.max(10, Math.min(100, Math.round(Number(search.get("page_size") || 25))));
    const sort = cleanText(search.get("sort"), 20) || "name";
    const direction = cleanText(search.get("direction"), 10) || "asc";
    if (!ALLOWED_SORTS.has(sort) || !ALLOWED_DIRECTIONS.has(direction)) throw new Error("Choose a valid table sort.");
    const radius = optionalNumber(search.get("radius"));
    const centerLat = optionalNumber(search.get("lat"));
    const centerLng = optionalNumber(search.get("lng"));
    if (radius !== null && (radius < 1 || radius > 250 || centerLat === null || centerLng === null)) throw new Error("Choose a valid center and radius between 1 and 250 miles.");
    const marketText = cleanText(search.get("market"), 60);
    const market = /^[0-9a-f-]{36}$/i.test(marketText) ? marketText : null;
    const addressReview = search.get("address_review") === "true" ? true : search.get("address_review") === "false" ? false : null;
    const [{ data, error }, totalResult, activeResult, pendingResult, newResult, suspendedResult, offboardedResult, addressReviewResult, marketResult] = await Promise.all([
      admin.rpc("admin_list_salons", {
        acting_admin_id: user.id,
        search_text: cleanText(search.get("q"), 120) || null,
        state_filter: cleanText(search.get("state"), 2) || null,
        market_filter: market,
        status_filter: cleanText(search.get("status"), 20) || null,
        plan_filter: cleanText(search.get("plan"), 20) || null,
        minimum_rating: optionalNumber(search.get("rating")),
        address_review_filter: addressReview,
        center_latitude: centerLat,
        center_longitude: centerLng,
        radius_miles: radius,
        sort_field: sort,
        sort_direction: direction,
        result_limit: pageSize,
        result_offset: (page - 1) * pageSize,
      }),
      admin.from("salons").select("id", { count: "exact", head: true }),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("status", "Active"),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("status", "Pending"),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("status", "New"),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("status", "Suspended"),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("status", "Offboarded"),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("address_needs_review", true),
      admin.from("location_markets").select("id,state_code,name,market_type,center_latitude,center_longitude").eq("is_active", true).order("state_code").order("name"),
    ]);
    if (error) throw error;
    for (const result of [totalResult, activeResult, pendingResult, newResult, suspendedResult, offboardedResult, addressReviewResult]) if (result.error) throw result.error;
    if (marketResult.error) throw marketResult.error;
    return Response.json({
      salons: data || [],
      total: Number(data?.[0]?.total_count || 0),
      page,
      page_size: pageSize,
      summary: { total: totalResult.count || 0, active: activeResult.count || 0, pending: (pendingResult.count || 0) + (newResult.count || 0), suspended: suspendedResult.count || 0, offboarded: offboardedResult.count || 0, address_needs_review: addressReviewResult.count || 0 },
      markets: marketResult.data || [],
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin salon list failed", error);
    return errorResponse(error, "Unable to load salons.");
  }
}
