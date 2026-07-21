import { cleanText } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { validCoordinates } from "@/lib/location";

const ALLOWED_SORTS = new Set(["name", "rating", "reviews", "status", "distance"]);
const ALLOWED_DIRECTIONS = new Set(["asc", "desc"]);
const ALLOWED_STATUSES = new Set([
  "New",
  "Pending",
  "Approved",
  "Ready for Activation",
  "Active",
  "Needs Attention",
  "Suspended",
  "Offboarded",
]);
const ALLOWED_PLANS = new Set(["Basic", "Growth", "Premium"]);
const ALLOWED_SETUP = new Set(["complete", "incomplete"]);
const ALLOWED_SUBSCRIPTION = new Set(["eligible", "ineligible"]);

function optionalNumber(value: string | null, label: string) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  return parsed;
}

function optionalBoolean(value: string | null, label: string) {
  if (value === null || value === "") return null;
  if (!['true', 'false'].includes(value)) throw new Error(`Choose a valid ${label} filter.`);
  return value === "true";
}

function adminListError(error: unknown, requestId: string) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = error instanceof Error ? error.message : String(record.message || "");
  const status = message === "Unauthorized" ? 401 : message.startsWith("Forbidden") ? 403 : record.code ? 500 : 400;
  console.error("Admin salon list failed", {
    requestId,
    status,
    code: record.code || null,
    message: message || "Unknown error",
    details: record.details || null,
    hint: record.hint || null,
  });
  const safeMessage = status >= 500
    ? `Salon records could not be loaded. Retry or contact support with reference ${requestId}.`
    : message || "Unable to load salons.";
  return Response.json(
    { error: safeMessage, request_id: requestId },
    { status, headers: { "Cache-Control": "private, no-store", "X-Request-ID": requestId } },
  );
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
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
    if (radius !== null && (radius < 1 || radius > 250 || centerLat === null || centerLng === null || !validCoordinates({ lat: centerLat, lng: centerLng }))) {
      throw new Error("Choose a valid center and radius between 1 and 250 miles.");
    }
    if (radius === null && (centerLat !== null || centerLng !== null)) throw new Error("Choose a radius with the selected center.");

    const marketText = cleanText(search.get("market"), 60);
    if (marketText && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(marketText)) throw new Error("Choose a valid market.");
    const status = cleanText(search.get("status"), 30);
    const plan = cleanText(search.get("plan"), 20);
    const state = cleanText(search.get("state"), 2).toUpperCase();
    const setup = cleanText(search.get("setup"), 20).toLowerCase();
    const subscription = cleanText(search.get("subscription_eligibility"), 20).toLowerCase();
    const rating = optionalNumber(search.get("rating"), "Rating");
    const addressReview = optionalBoolean(search.get("address_review"), "address review");
    const discoverability = optionalBoolean(search.get("discoverability"), "discoverability");
    if (status && !ALLOWED_STATUSES.has(status)) throw new Error("Choose a valid salon status.");
    if (plan && !ALLOWED_PLANS.has(plan)) throw new Error("Choose a valid plan.");
    if (state && !/^[A-Z]{2}$/.test(state)) throw new Error("Choose a valid US state.");
    if (setup && !ALLOWED_SETUP.has(setup)) throw new Error("Choose a valid setup filter.");
    if (subscription && !ALLOWED_SUBSCRIPTION.has(subscription)) throw new Error("Choose a valid subscription eligibility filter.");
    if (rating !== null && (rating < 0 || rating > 5)) throw new Error("Rating must be between 0 and 5.");

    const rpcParams = {
      p_acting_admin_id: user.id,
      p_search_text: cleanText(search.get("q"), 120) || null,
      p_state_filter: state || null,
      p_market_filter: marketText || null,
      p_status_filter: status || null,
      p_plan_filter: plan || null,
      p_minimum_rating: rating,
      p_address_review_filter: addressReview,
      p_center_latitude: centerLat,
      p_center_longitude: centerLng,
      p_radius_miles: radius,
      p_setup_filter: setup || null,
      p_subscription_filter: subscription || null,
      p_discoverability_filter: discoverability,
      p_sort_field: sort,
      p_sort_direction: direction,
      p_result_limit: pageSize,
      p_result_offset: (page - 1) * pageSize,
    };

    const [listResult, totalResult, activeResult, pendingResult, newResult, suspendedResult, offboardedResult, addressReviewResult, marketResult] = await Promise.all([
      admin.rpc("admin_list_salons", rpcParams),
      admin.from("salons").select("id", { count: "exact", head: true }),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("status", "Active"),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("status", "Pending"),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("status", "New"),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("status", "Suspended"),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("status", "Offboarded"),
      admin.from("salons").select("id", { count: "exact", head: true }).eq("address_needs_review", true),
      admin.from("location_markets").select("id,state_code,name,market_type,center_latitude,center_longitude").eq("is_active", true).order("state_code").order("name"),
    ]);
    if (listResult.error) throw listResult.error;
    for (const result of [totalResult, activeResult, pendingResult, newResult, suspendedResult, offboardedResult, addressReviewResult]) if (result.error) throw result.error;
    if (marketResult.error) throw marketResult.error;

    const rows = Array.isArray(listResult.data) ? listResult.data : [];
    let filteredTotal = Number(rows[0]?.total_count || 0);
    if (!rows.length && page > 1) {
      const countProbe = await admin.rpc("admin_list_salons", { ...rpcParams, p_result_limit: 1, p_result_offset: 0 });
      if (countProbe.error) throw countProbe.error;
      filteredTotal = Number(countProbe.data?.[0]?.total_count || 0);
    }

    return Response.json({
      salons: rows,
      total: filteredTotal,
      page,
      page_size: pageSize,
      summary: {
        total: totalResult.count || 0,
        active: activeResult.count || 0,
        pending: (pendingResult.count || 0) + (newResult.count || 0),
        suspended: suspendedResult.count || 0,
        offboarded: offboardedResult.count || 0,
        address_needs_review: addressReviewResult.count || 0,
      },
      markets: marketResult.data || [],
      request_id: requestId,
    }, { headers: { "Cache-Control": "private, no-store", "X-Request-ID": requestId } });
  } catch (error) {
    return adminListError(error, requestId);
  }
}
