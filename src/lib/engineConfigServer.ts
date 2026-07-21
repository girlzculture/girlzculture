import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function getPublishedEngineConfig(keys?: string[], options: { publicOnly?: boolean } = {}) {
  try {
    let query = getSupabaseAdmin().from("engine_settings").select("setting_key,published_value,published_version").eq("status", "Published");
    if (keys?.length) query = query.in("setting_key", keys);
    if (options.publicOnly) query = query.eq("is_public", true);
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

export async function getEngineText(key:string,fallback:string,maximum=500){
  const config=await getPublishedEngineConfig([key]);const value=String(config[key]??"").trim();return value&&value.length<=maximum?value:fallback;
}

export async function getEngineColor(key:string,fallback:string){
  const value=await getEngineText(key,fallback,7);
  return /^#[0-9a-f]{6}$/i.test(value)?value:fallback;
}

export async function getEngineList(key:string,fallback:string[],maximum=100){
  const config=await getPublishedEngineConfig([key]);const value=Array.isArray(config[key])?config[key].map(item=>String(item).trim()).filter(Boolean).slice(0,maximum):[];return value.length?value:fallback;
}

export async function getEngineBoolean(key:string,fallback:boolean){
  const config=await getPublishedEngineConfig([key]);const value=config[key];return typeof value==="boolean"?value:fallback;
}
