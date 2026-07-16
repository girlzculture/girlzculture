import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { validCoordinates } from "@/lib/location";

const ALLOWED_SORTS = new Set(["name","rating","reviews","status","distance"]);
const ALLOWED_DIRECTIONS = new Set(["asc","desc"]);
const ALLOWED_STATUSES = new Set(["New", "Pending", "Active", "Suspended", "Offboarded"]);
const ALLOWED_PLANS = new Set(["Basic", "Growth", "Premium"]);

function optionalNumber(value: string | null, label: string) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  return parsed;
}

export async function GET(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "salons");
    const search = new URL(request.url).searchParams;
    const page = Number(search.get("page") || 1);
    const pageSize = Number(search.get("page_size") || 25);
    if (!Number.isInteger(page) || page < 1 || page > 100_000) throw new Error("Choose a valid page number.");
    if (!Number.isInteger(pageSize) || pageSize < 10 || pageSize > 100) throw new Error("Page size must be between 10 and 100.");
    const sort = cleanText(search.get("sort"), 20) || "name";
    const direction = cleanText(search.get("direction"), 10) || "asc";
    if (!ALLOWED_SORTS.has(sort) || !ALLOWED_DIRECTIONS.has(direction)) throw new Error("Choose a valid table sort.");
    const radius = optionalNumber(search.get("radius"), "Radius");
    const centerLat = optionalNumber(search.get("lat"), "Latitude");
    const centerLng = optionalNumber(search.get("lng"), "Longitude");
    if (radius !== null && (radius < 1 || radius > 250 || centerLat === null || centerLng === null || !validCoordinates({ lat: centerLat, lng: centerLng }))) throw new Error("Choose a valid center and radius between 1 and 250 miles.");
    if (radius === null && (centerLat !== null || centerLng !== null)) throw new Error("Choose a radius with the selected center.");
    const marketText = cleanText(search.get("market"), 60);
    if (marketText && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(marketText)) throw new Error("Choose a valid market.");
    const market = marketText || null;
    const status = cleanText(search.get("status"), 20);
    const plan = cleanText(search.get("plan"), 20);
    const state = cleanText(search.get("state"), 2).toUpperCase();
    const rating = optionalNumber(search.get("rating"), "Rating");
    if (status && !ALLOWED_STATUSES.has(status)) throw new Error("Choose a valid salon status.");
    if (plan && !ALLOWED_PLANS.has(plan)) throw new Error("Choose a valid plan.");
    if (state && !/^[A-Z]{2}$/.test(state)) throw new Error("Choose a valid US state.");
    if (rating !== null && (rating < 0 || rating > 5)) throw new Error("Rating must be between 0 and 5.");
    const addressReviewText = search.get("address_review");
    if (addressReviewText && !["true", "false"].includes(addressReviewText)) throw new Error("Choose a valid address review filter.");
    const addressReview = addressReviewText === "true" ? true : addressReviewText === "false" ? false : null;
    const [{ data, error }, totalResult, activeResult, pendingResult, newResult, suspendedResult, offboardedResult, addressReviewResult, marketResult] = await Promise.all([
      admin.rpc("admin_list_salons", {
        acting_admin_id: user.id,
        search_text: cleanText(search.get("q"), 120) || null,
        state_filter: state || null,
        market_filter: market,
        status_filter: status || null,
        plan_filter: plan || null,
        minimum_rating: rating,
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
