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
  errorResponse,
  rejectBot,
} from "@/lib/requestSecurity";

export const runtime = "nodejs";

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "decision-search", 60, 10 * 60_000);
    const body = (await request.json()) as Record<string, unknown>;
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
    const filters: DecisionSearchFilters = {
      radiusMiles: optionalNumber(rawFilters.radiusMiles),
      minimumRating: optionalNumber(rawFilters.minimumRating),
      maximumPrice: optionalNumber(rawFilters.maximumPrice),
      date: cleanText(rawFilters.date, 10) || null,
      sort: allowedSort.has(sort)
        ? (sort as DecisionSearchFilters["sort"])
        : undefined,
      promotionOnly: rawFilters.promotionOnly === true,
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
  } catch (error) {
    return errorResponse(error, "Search could not be completed.");
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/discovery/decision-search", "POST"),
  POSTHandler,
);
