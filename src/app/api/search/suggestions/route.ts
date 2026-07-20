import { createHash } from "node:crypto";
import { cleanText, enforceRateLimit, publicErrorResponse } from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  deterministicSearchScore,
  normalizeSearchText,
  ruleCandidates,
  searchTokens,
  type SearchLanguageRule,
} from "@/lib/searchLanguage";

type SalonRow = {
  id: string;
  name: string;
  slug: string;
  address_city: string | null;
  address_state: string | null;
  borough: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Suggestion = {
  kind: "style" | "salon" | "category" | "location";
  label: string;
  value?: string;
  subtitle?: string;
  href?: string;
  lat?: number;
  lng?: number;
  matched_terms?: string[];
  score: number;
};

const safeArray = (value: unknown) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
const publicSuggestion = (item: Suggestion) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "score"));

export async function GET(request: Request) {
  try {
    enforceRateLimit(request, "search-suggestions", 120, 10 * 60_000);
    const params = new URL(request.url).searchParams;
    const type = cleanText(params.get("type"), 20);
    const rawTerm = cleanText(params.get("q"), 80);
    const term = normalizeSearchText(rawTerm);
    if (type !== "style") return Response.json({ suggestions: [], groups: [], no_result: false });

    const admin = getSupabaseAdmin();
    const [settingsResult, rulesResult, salonsResult, catalogResult, categoriesResult, offeringsResult, marketsResult] = await Promise.all([
      admin.from("search_engine_settings").select("stop_words,fuzzy_distance,zero_result_logging_enabled").eq("id", true).maybeSingle(),
      admin.from("search_language_rules").select("target_type,target_id,canonical_term,aliases,keywords,common_phrases,misspellings,ranking_boost,is_active").eq("is_active", true).limit(2_000),
      admin.from("salons").select("id,name,slug,address_city,address_state,borough,latitude,longitude").eq("status", "Active").eq("is_discoverable", true).in("subscription_status", ["active", "trialing"]).eq("geocode_status", "success").eq("address_needs_review", false).limit(500),
      admin.from("master_styles").select("id,name,category_id,service_group_id,sort_order").eq("is_active", true).order("sort_order").limit(2_000),
      admin.from("service_categories").select("id,name,slug,sort_order").eq("is_active", true).order("sort_order").limit(500),
      admin.from("styles").select("salon_id,master_style_id,name").limit(5_000),
      admin.from("location_markets").select("id,name,state_code,center_latitude,center_longitude").eq("is_active", true).order("name").limit(500),
    ]);
    const firstError = [settingsResult.error, rulesResult.error, salonsResult.error, catalogResult.error, categoriesResult.error, offeringsResult.error, marketsResult.error].find(Boolean);
    if (firstError) throw firstError;

    const settings = settingsResult.data || { stop_words: [], fuzzy_distance: 2, zero_result_logging_enabled: true };
    const stopWords = safeArray(settings.stop_words);
    const fuzzyDistance = Number(settings.fuzzy_distance ?? 2);
    const rules = (rulesResult.data || []).map((row) => ({
      ...row,
      aliases: safeArray(row.aliases),
      keywords: safeArray(row.keywords),
      common_phrases: safeArray(row.common_phrases),
      misspellings: safeArray(row.misspellings),
      ranking_boost: Number(row.ranking_boost || 0),
    })) as SearchLanguageRule[];
    const ruleMap = new Map(rules.map((rule) => [`${rule.target_type}:${rule.target_id}`, rule]));
    const salons = (salonsResult.data || []) as SalonRow[];
    const visibleSalonIds = new Set(salons.map((salon) => salon.id));
    const offerings = (offeringsResult.data || []).filter((style) => visibleSalonIds.has(String(style.salon_id)));
    const offeredMasterIds = new Set(offerings.map((style) => String(style.master_style_id || "")).filter(Boolean));

    const styleItems: Suggestion[] = (catalogResult.data || [])
      .filter((style) => offeredMasterIds.has(String(style.id)))
      .map((style) => {
        const rule = ruleMap.get(`service:${style.id}`);
        return {
          kind: "style" as const,
          label: String(style.name),
          value: String(style.name),
          score: deterministicSearchScore({ query: term, candidates: ruleCandidates(rule, String(style.name)), stopWords, fuzzyDistance, boost: rule?.ranking_boost }),
          matched_terms: searchTokens(term, stopWords),
        };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
      .slice(0, 8);

    const offeredCategoryIds = new Set((catalogResult.data || []).filter((style) => offeredMasterIds.has(String(style.id))).map((style) => String(style.category_id)));
    const categoryItems: Suggestion[] = (categoriesResult.data || [])
      .filter((category) => offeredCategoryIds.has(String(category.id)))
      .map((category) => {
        const rule = ruleMap.get(`category:${category.id}`);
        return {
          kind: "category" as const,
          label: String(category.name),
          value: String(category.name),
          score: deterministicSearchScore({ query: term, candidates: ruleCandidates(rule, String(category.name)), stopWords, fuzzyDistance, boost: rule?.ranking_boost }),
          matched_terms: searchTokens(term, stopWords),
        };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
      .slice(0, 5);

    const salonItems: Suggestion[] = salons
      .map((salon) => ({
        kind: "salon" as const,
        label: salon.name,
        subtitle: [salon.borough || salon.address_city, salon.address_state].filter(Boolean).join(", "),
        href: `/salon/${salon.slug}`,
        score: deterministicSearchScore({ query: term, candidates: [salon.name], stopWords, fuzzyDistance, boost: 1 }),
        matched_terms: searchTokens(term, stopWords),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
      .slice(0, 6);

    const marketLocations: Suggestion[] = (marketsResult.data || []).map((market) => ({
      kind: "location" as const,
      label: `${market.name}, ${market.state_code}`,
      value: `${market.name}, ${market.state_code}`,
      lat: Number(market.center_latitude),
      lng: Number(market.center_longitude),
      score: deterministicSearchScore({ query: term, candidates: [String(market.name), String(market.state_code), `${market.name}, ${market.state_code}`], stopWords, fuzzyDistance, boost: 1 }),
      matched_terms: searchTokens(term, stopWords),
    }));
    const salonLocations: Suggestion[] = salons.filter((salon) => Number.isFinite(Number(salon.latitude)) && Number.isFinite(Number(salon.longitude))).flatMap((salon) => {
      const places = [salon.borough, salon.address_city].filter(Boolean) as string[];
      return places.map((place) => ({
        kind: "location" as const,
        label: [place, salon.address_state].filter(Boolean).join(", "),
        value: [place, salon.address_state].filter(Boolean).join(", "),
        lat: Number(salon.latitude),
        lng: Number(salon.longitude),
        score: deterministicSearchScore({ query: term, candidates: [place, salon.address_state || "", `${place} ${salon.address_state || ""}`], stopWords, fuzzyDistance, boost: 1 }),
        matched_terms: searchTokens(term, stopWords),
      }));
    });
    const locationItems = [...new Map([...marketLocations, ...salonLocations]
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
      .map((item) => [normalizeSearchText(item.label), item])).values()].slice(0, 6);

    const groups = [
      { kind: "style", label: "Styles / Services", items: styleItems },
      { kind: "salon", label: "Salons", items: salonItems },
      { kind: "category", label: "Categories", items: categoryItems },
      { kind: "location", label: "Locations", items: locationItems },
    ].filter((group) => group.items.length);
    const noResult = Boolean(term.length >= 2 && groups.length === 0);

    if (noResult && settings.zero_result_logging_enabled !== false) {
      const queryHash = createHash("sha256").update(term).digest("hex");
      const locale = cleanText(request.headers.get("accept-language")?.split(",")[0] || "en", 20) || "en";
      const { error: existingError, data: existing } = await admin.from("search_zero_result_aggregates").select("id,searches").eq("occurred_on", new Date().toISOString().slice(0, 10)).eq("query_hash", queryHash).eq("locale", locale).eq("search_context", "public").maybeSingle();
      if (existingError) console.error("Zero-result aggregate lookup failed", existingError);
      else if (existing) {
        const { error } = await admin.from("search_zero_result_aggregates").update({ searches: Number(existing.searches || 0) + 1, last_seen_at: new Date().toISOString() }).eq("id", existing.id);
        if (error) console.error("Zero-result aggregate update failed", error);
      } else {
        const { error } = await admin.from("search_zero_result_aggregates").insert({ query_hash: queryHash, token_count: searchTokens(term).length, locale, search_context: "public" });
        if (error) console.error("Zero-result aggregate insert failed", error);
      }
    }

    return Response.json({
      suggestions: styleItems.map((item) => item.label),
      groups: groups.map((group) => ({ ...group, items: group.items.map(publicSuggestion) })),
      no_result: noResult,
    }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch (error) {
    console.error("Search suggestion load failed", error);
    return publicErrorResponse(error, "Search suggestions are temporarily unavailable.");
  }
}
