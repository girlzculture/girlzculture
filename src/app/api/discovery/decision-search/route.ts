import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  runDecisionSearch,
  type DecisionSearchFilters,
} from "@/lib/decisionSearchServer";
import { validCoordinates } from "@/lib/location";
import {
  cleanText,
  enforceRateLimit,
  rejectBot,
} from "@/lib/requestSecurity";

export const runtime = "nodejs";

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function POSTHandler(request: Request) {
  enforceRateLimit(request, "decision-search", 60, 10 * 60_000);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Send a valid search request." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  rejectBot(body);
  const query = cleanText(body.query, 600);
  if (query.length < 2) {
    return Response.json(
      { error: "Enter the service, salon, price, or location you need." },
      { status: 400 },
    );
  }
  const coordinates = {
    lat: Number(body.latitude),
    lng: Number(body.longitude),
  };
  const rawFilters =
    body.filters &&
    typeof body.filters === "object" &&
    !Array.isArray(body.filters)
      ? (body.filters as Record<string, unknown>)
      : {};
  const allowedSort = new Set([
    "distance",
    "rating",
    "price_low",
    "price_high",
  ]);
  const sort = cleanText(rawFilters.sort, 30);
  const serviceId = cleanText(rawFilters.serviceId, 50) || null;
  if (
    serviceId &&
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(serviceId)
  ) {
    return Response.json(
      { error: "Choose a valid style before searching." },
      { status: 400 },
    );
  }
  const filters: DecisionSearchFilters = {
    serviceId,
    radiusMiles: optionalNumber(rawFilters.radiusMiles),
    minimumRating: optionalNumber(rawFilters.minimumRating),
    maximumPrice: optionalNumber(rawFilters.maximumPrice),
    date: cleanText(rawFilters.date, 10) || null,
    sort: allowedSort.has(sort)
      ? (sort as DecisionSearchFilters["sort"])
      : undefined,
    promotionOnly: rawFilters.promotionOnly === true,
    page: optionalNumber(rawFilters.page),
    pageSize: optionalNumber(rawFilters.pageSize),
  };
  const result = await runDecisionSearch({
    query,
    origin: validCoordinates(coordinates) ? coordinates : null,
    filters,
  });
  return Response.json(result, {
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  });
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/discovery/decision-search", "POST"),
  POSTHandler,
);
