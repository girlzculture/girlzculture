import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import {
  BUNDLED_MESSAGES,
  ENGLISH_MESSAGES,
  normalizeLocale,
} from "@/i18n/catalog";
import { GENERATED_SOURCE_MESSAGES } from "@/i18n/generated-source-messages";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const FALLBACK_LOCALES = [
  {
    locale: "en",
    display_name: "English",
    native_name: "English",
    intl_locale: "en-US",
    text_direction: "ltr",
    is_default: true,
    sort_order: 1,
  },
  {
    locale: "es",
    display_name: "Spanish",
    native_name: "Español",
    intl_locale: "es-US",
    text_direction: "ltr",
    is_default: false,
    sort_order: 2,
  },
  {
    locale: "fr",
    display_name: "French",
    native_name: "Français",
    intl_locale: "fr-FR",
    text_direction: "ltr",
    is_default: false,
    sort_order: 3,
  },
  {
    locale: "wo",
    display_name: "Wolof",
    native_name: "Wolof",
    intl_locale: "wo-SN",
    text_direction: "ltr",
    is_default: false,
    sort_order: 4,
  },
];

async function GETHandler(request: Request) {
  const requested = normalizeLocale(
    new URL(request.url).searchParams.get("locale"),
  );
  try {
    const admin = getSupabaseAdmin();
    const { data: locales, error: localeError } = await admin
      .from("supported_locales")
      .select(
        "locale,display_name,native_name,intl_locale,text_direction,is_default,sort_order",
      )
      .eq("is_enabled", true)
      .is("archived_at", null)
      .order("sort_order");
    if (localeError) throw localeError;
    const enabled = locales || [];
    const defaultLocale =
      enabled.find((item) => item.is_default)?.locale || "en";
    const locale = enabled.some((item) => item.locale === requested)
      ? requested
      : defaultLocale;
    const { data, error } = await admin
      .from("translation_entries")
      .select("translation_key,source_text,translated_text")
      .eq("locale", locale)
      .eq("status", "Published");
    if (error) throw error;
    const total = new Set([
      ...Object.keys(ENGLISH_MESSAGES),
      ...Object.keys(GENERATED_SOURCE_MESSAGES),
    ]).size;
    const published = locale === "en" ? total : new Set([
      ...Object.keys(BUNDLED_MESSAGES[locale] || {}),
      ...(data || []).map((row) => row.translation_key),
    ]).size;
    return Response.json(
      {
        locale,
        locales: enabled,
        messages: {
          ...BUNDLED_MESSAGES[locale],
          ...Object.fromEntries(
            (data || []).map((row) => [
              row.translation_key,
              row.translated_text,
            ]),
          ),
        },
        sourceMessages: Object.fromEntries(
          (data || [])
            .filter((row) => row.source_text && row.translated_text)
            .map((row) => [
              String(row.source_text).replace(/\s+/g, " ").trim(),
              row.translated_text,
            ]),
        ),
        coverage: { published: Math.min(published, total), total, incomplete: locale !== "en" && published < total },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    noteOperationalFailure(
      "Dynamic localization registry unavailable; using bundled fallback",
      error,
    );
    return Response.json({
      locale: requested,
      locales: FALLBACK_LOCALES,
      messages: BUNDLED_MESSAGES[requested] || ENGLISH_MESSAGES,
      sourceMessages: {},
      coverage: { published: requested === "en" ? Object.keys(ENGLISH_MESSAGES).length : Object.keys(BUNDLED_MESSAGES[requested] || {}).length, total: Object.keys(ENGLISH_MESSAGES).length, incomplete: requested !== "en" },
    });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/i18n", "GET"), GETHandler);
