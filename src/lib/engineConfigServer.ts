import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function getPublishedEngineConfig(keys?: string[]) {
  try {
    let query = getSupabaseAdmin().from("engine_settings").select("setting_key,published_value,published_version").eq("status", "Published");
    if (keys?.length) query = query.in("setting_key", keys);
    const { data, error } = await query;
    if (error) throw error;
    return Object.fromEntries((data || []).map((row) => [row.setting_key, row.published_value])) as Record<string, unknown>;
  } catch (error) {
    console.warn("Published Engine configuration unavailable; using integrity-safe defaults", error);
    return {};
  }
}

export async function getEngineNumber(key: string, fallback: number, minimum: number, maximum: number) {
  const config = await getPublishedEngineConfig([key]);
  const parsed = Number(config[key]);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
