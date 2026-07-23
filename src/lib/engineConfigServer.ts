import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { capturePlatformError } from "@/lib/platformErrors";
import { hasOperationalContext } from "@/lib/operationalTelemetryContext";

export async function getPublishedEngineConfig(keys?: string[], options: { publicOnly?: boolean } = {}) {
  const admin = getSupabaseAdmin();
  try {
    let query = admin.from("engine_settings").select("setting_key,published_value,published_version").eq("status", "Published");
    if (keys?.length) query = query.in("setting_key", keys);
    if (options.publicOnly) query = query.eq("is_public", true);
    const { data, error } = await query;
    if (error) throw error;
    return Object.fromEntries((data || []).map((row) => [row.setting_key, row.published_value])) as Record<string, unknown>;
  } catch (error) {
    // Service-role transport monitoring has already attached this failure to an
    // active API request. Outside a route (for example server rendering), persist
    // the same sanitized operational event directly.
    if (!hasOperationalContext()) {
      await capturePlatformError({
        admin,
        error,
        feature: "engine-configuration",
        action: "load-published-configuration",
        actorRole: "system",
        provider: "supabase",
        safeMessage: "Published configuration could not be loaded.",
        severity: "high",
        metadata: {
          public_only: Boolean(options.publicOnly),
          requested_key_count: keys?.length || 0,
          fallback_used: true,
        },
      });
    }
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
