import {
  noteOperationalFailure,
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
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveCatalogCorrection,
  type CatalogCorrection,
  type CatalogCorrectionCandidate,
} from "@/lib/catalogFuzzySearchCore";

export const runtime = "nodejs";

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const safeArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];

async function catalogCorrection(query: string): Promise<CatalogCorrection | null> {
  try {
    const admin = getSupabaseAdmin();
    const [stylesResult, rulesResult] = await Promise.all([
      admin
        .from("master_styles")
        .select("id,name")
        .eq("is_active", true)
        .is("archived_at", null)
        .limit(2_000),
      admin
        .from("search_language_rules")
        .select("target_id,canonical_term,aliases,keywords,common_phrases,misspellings")
        .eq("target_type", "service")
        .eq("is_active", true)
        .limit(2_000),
    ]);
    if (stylesResult.error) throw stylesResult.error;
    if (rulesResult.error) throw rulesResult.error;
    const rules = new Map(
      (rulesResult.data || []).map((rule) => [String(rule.target_id), rule]),
    );
    const candidates: CatalogCorrectionCandidate[] = (stylesResult.data || []).map(
      (style) => {
        const rule = rules.get(String(style.id));
        return {
          id: String(style.id),
          name: String(style.name),
          terms: [
            String(rule?.canonical_term || ""),
            ...safeArray(rule?.aliases),
            ...safeArray(rule?.keywords),
            ...safeArray(rule?.common_phrases),
            ...safeArray(rule?.misspellings),
          ].filter(Boolean),
        };
      },
    );
    return resolveCatalogCorrection(query, candidates);
  } catch (error) {
    noteOperationalFailure("Catalog typo correction lookup failed", error);
    return null;
  }
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
  let serviceId = cleanText(rawFilters.serviceId, 50) || null;
  if (
    serviceId &&
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(serviceId)
  ) {
    return Response.json(
      { error: "Choose a valid style before searching." },
      { status: 400 },
    );
  }
  const correction = serviceId ? null : await catalogCorrection(query);
  if (correction) serviceId = correction.serviceId;
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
  const corrected = Boolean(correction && !correction.exact);
  const correctionMessage = corrected
    ? `Showing results for ${correction?.serviceName}.`
    : "";
  return Response.json(
    {
      ...result,
      summary: correctionMessage
        ? `${correctionMessage} ${String(result.summary || "")}`.trim()
        : result.summary,
      original_query: query,
      resolved_query: correction?.resolvedQuery || query,
      corrected_terms: correction?.correctedTerms || [],
      correction_confidence: correction?.confidence || null,
      stable_service_id: serviceId,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
      },
    },
  );
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/discovery/decision-search", "POST"),
  POSTHandler,
);
