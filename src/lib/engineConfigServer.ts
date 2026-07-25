import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { capturePlatformError } from "@/lib/platformErrors";
import { hasOperationalContext } from "@/lib/operationalTelemetryContext";

export async function getPublishedEngineConfig(keys?: string[], options: { publicOnly?: boolean } = {}) {
  let admin: ReturnType<typeof getSupabaseAdmin> | undefined;
  try {
    admin = getSupabaseAdmin();
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

export type EngineBrandTheme = {
  primary: string;
  accent: string;
  cta: string;
  page: string;
  card: string;
  header: string;
  footer: string;
  heading: string;
  body: string;
  muted: string;
  link: string;
  success: string;
  warning: string;
  error: string;
  hover: string;
  focus: string;
  disabled: string;
  headingFont: string;
  bodyFont: string;
};

const BRAND_KEYS = [
  "branding.primary_color",
  "branding.accent_color",
  "branding.cta_color",
  "branding.page_background",
  "branding.card_background",
  "branding.header_background",
  "branding.footer_background",
  "branding.heading_color",
  "branding.body_color",
  "branding.muted_color",
  "branding.link_color",
  "branding.success_color",
  "branding.warning_color",
  "branding.error_color",
  "branding.hover_color",
  "branding.focus_color",
  "branding.disabled_color",
  "branding.heading_font",
  "branding.body_font",
] as const;

function publishedColor(
  config: Record<string, unknown>,
  key: string,
  fallback: string,
) {
  const value = String(config[key] ?? "");
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function publishedFont(
  config: Record<string, unknown>,
  key: string,
  allowed: string[],
  fallback: string,
) {
  const value = String(config[key] ?? "");
  return allowed.includes(value) ? value : fallback;
}

export async function getEngineBrandTheme(): Promise<EngineBrandTheme> {
  const config = await getPublishedEngineConfig([...BRAND_KEYS], {
    publicOnly: true,
  });
  return {
    primary: publishedColor(config, "branding.primary_color", "#C65A3A"),
    accent: publishedColor(config, "branding.accent_color", "#B88A44"),
    cta: publishedColor(config, "branding.cta_color", "#C65A3A"),
    page: publishedColor(config, "branding.page_background", "#FFF8F0"),
    card: publishedColor(config, "branding.card_background", "#FFF8F0"),
    header: publishedColor(config, "branding.header_background", "#FFF8F0"),
    footer: publishedColor(config, "branding.footer_background", "#281F16"),
    heading: publishedColor(config, "branding.heading_color", "#281F16"),
    body: publishedColor(config, "branding.body_color", "#281F16"),
    muted: publishedColor(config, "branding.muted_color", "#6B7A4E"),
    link: publishedColor(config, "branding.link_color", "#C65A3A"),
    success: publishedColor(config, "branding.success_color", "#6B7A4E"),
    warning: publishedColor(config, "branding.warning_color", "#B88A44"),
    error: publishedColor(config, "branding.error_color", "#C65A3A"),
    hover: publishedColor(config, "branding.hover_color", "#A9472F"),
    focus: publishedColor(config, "branding.focus_color", "#D4AF37"),
    disabled: publishedColor(config, "branding.disabled_color", "#E7D7C1"),
    headingFont: publishedFont(
      config,
      "branding.heading_font",
      ["Playfair Display", "Fraunces", "Georgia"],
      "Playfair Display",
    ),
    bodyFont: publishedFont(
      config,
      "branding.body_font",
      ["Montserrat", "Inter", "Arial"],
      "Montserrat",
    ),
  };
}
