import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

function stringList(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Enter search terms as a list.");
  const values = [...new Set(value.map((item) => cleanText(item, 120)).filter(Boolean))];
  if (values.length > 60) throw new Error("Use no more than 60 terms in one field.");
  return values;
}

async function GETHandler(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "settings");
    const [settings, rules, services, categories, zeroResults] = await Promise.all([
      admin.from("search_engine_settings").select("*").eq("id", true).single(),
      admin.from("search_language_rules").select("*").order("target_type").order("canonical_term"),
      admin.from("master_styles").select("id,name,is_active").order("name"),
      admin.from("service_categories").select("id,name,is_active").order("name"),
      admin.from("search_zero_result_aggregates").select("occurred_on,query_hash,token_count,locale,search_context,searches,last_seen_at").order("last_seen_at", { ascending: false }).limit(100),
    ]);
    const firstError = [settings.error, rules.error, services.error, categories.error, zeroResults.error].find(Boolean);
    if (firstError) throw firstError;
    return Response.json({
      settings: settings.data,
      rules: rules.data || [],
      targets: { services: services.data || [], categories: categories.data || [] },
      zero_results: zeroResults.data || [],
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    noteOperationalFailure("Search engine settings load failed", error);
    return errorResponse(error, "Unable to load search controls.");
  }
}

async function PATCHHandler(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "settings");
    const body = await request.json() as Record<string, unknown>;
    if (body.settings && typeof body.settings === "object") {
      const input = body.settings as Record<string, unknown>;
      const fuzzyDistance = Number(input.fuzzy_distance);
      if (!Number.isInteger(fuzzyDistance) || fuzzyDistance < 0 || fuzzyDistance > 3) throw new Error("Fuzzy distance must be a whole number from 0 to 3.");
      const record = {
        id: true,
        stop_words: stringList(input.stop_words),
        fuzzy_distance: fuzzyDistance,
        zero_result_logging_enabled: input.zero_result_logging_enabled !== false,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };
      const { data, error } = await admin.from("search_engine_settings").upsert(record).select().single();
      if (error) throw error;
      return Response.json({ settings: data });
    }

    const input = body.rule && typeof body.rule === "object" ? body.rule as Record<string, unknown> : {};
    const targetType = cleanText(input.target_type, 20);
    const targetId = cleanText(input.target_id, 50);
    if (!targetId || !["service", "category"].includes(targetType)) throw new Error("Choose a valid search target.");
    const table = targetType === "service" ? "master_styles" : "service_categories";
    const { data: target, error: targetError } = await admin.from(table).select("id,name").eq("id", targetId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new Error("That service or category no longer exists.");
    const rankingBoost = Number(input.ranking_boost);
    if (!Number.isFinite(rankingBoost) || rankingBoost < 0 || rankingBoost > 100) throw new Error("Ranking boost must be from 0 to 100.");
    const record = {
      target_type: targetType,
      target_id: targetId,
      canonical_term: cleanText(input.canonical_term, 120) || target.name,
      aliases: stringList(input.aliases),
      keywords: stringList(input.keywords),
      common_phrases: stringList(input.common_phrases),
      misspellings: stringList(input.misspellings),
      ranking_boost: rankingBoost,
      is_active: input.is_active !== false,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };
    const { data, error } = await admin.from("search_language_rules").upsert(record, { onConflict: "target_type,target_id" }).select().single();
    if (error) throw error;
    return Response.json({ rule: data });
  } catch (error) {
    noteOperationalFailure("Search engine settings update failed", error);
    return errorResponse(error, "Unable to update search controls.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/search", "GET"), GETHandler);
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/search", "PATCH"), PATCHHandler);
