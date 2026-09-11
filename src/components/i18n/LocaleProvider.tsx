"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  BUNDLED_MESSAGES,
  ENGLISH_MESSAGES,
  intlLocale,
  localeDirection,
  normalizeLocale,
  type AppLocale,
  type LocaleOption,
} from "@/i18n/catalog";
import { resolveSourceTranslation } from "@/lib/localizationCore";
import { DASHBOARD_SOURCE_MESSAGES } from "@/i18n/dashboard-source-catalog";
import { getSupabaseForScope, type AuthScope } from "@/lib/supabase";
import type { DashboardSurface } from "@/lib/hostRouting";
import { usesManagedLocalization } from "@/lib/publicTranslation";

type I18nContextValue = {
  locale: AppLocale;
  managedLocalization: boolean;
  locales: LocaleOption[];
  coverage: { published: number; total: number; incomplete: boolean };
  direction: "ltr" | "rtl";
  setLocale: (locale: AppLocale) => void;
  t: (
    key: string,
    fallback?: string,
    values?: Record<string, string | number>,
  ) => string;
  translateSource: (source: string) => string;
  formatDate: (
    value: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string) => string;
  plural: (count: number, forms: { one: string; other: string }) => string;
};
const Context = createContext<I18nContextValue | null>(null);
const EMPTY_MESSAGES: Record<string, string> = {};
const FALLBACK_LOCALES: LocaleOption[] = [
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
    sort_order: 2,
  },
  {
    locale: "fr",
    display_name: "French",
    native_name: "Français",
    intl_locale: "fr-FR",
    text_direction: "ltr",
    sort_order: 3,
  },
  {
    locale: "wo",
    display_name: "Wolof",
    native_name: "Wolof",
    intl_locale: "wo-SN",
    text_direction: "ltr",
    sort_order: 4,
  },
];
function scopeForPath(): AuthScope {
  if (
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/admin")
  )
    return "admin";
  if (
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/salon/")
  )
    return "salon";
  return "customer";
}

export default function LocaleProvider({
  children,
  initialLocale = "en",
  dashboardSurface = "public",
}: {
  children: React.ReactNode;
  initialLocale?: string;
  dashboardSurface?: DashboardSurface;
}) {
  const pathname = usePathname();
  const managedLocalization = usesManagedLocalization(pathname || "/", dashboardSurface);
  const [preferredLocale, setLocaleState] = useState<AppLocale>(() =>
    normalizeLocale(initialLocale),
  );
  // Public copy is authored in English. Saved internal preferences must not
  // mislabel it or compete with browser translation on the public document.
  const locale = managedLocalization ? preferredLocale : "en";
  const [translations, setTranslations] = useState<{ locale: string; messages: Record<string, string>; sources: Record<string, string> }>({ locale: "", messages: {}, sources: {} });
  const remote = translations.locale === locale ? translations.messages : EMPTY_MESSAGES;
  const sourceMessages = translations.locale === locale ? translations.sources : EMPTY_MESSAGES;
  const [locales, setLocales] = useState<LocaleOption[]>(FALLBACK_LOCALES);
  const [coverage, setCoverage] = useState({ published: 0, total: 0, incomplete: false });
  const persistAccountLocale = useCallback(async (safe: string) => {
    try {
      const client = getSupabaseForScope(scopeForPath());
      const { data } = await client.auth.getSession();
      if (!data.session) return;
      await fetch("/api/i18n/preference", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ locale: safe }),
      });
    } catch (error) {
      void error;
    }
  }, []);
  const setLocale = useCallback(
    (next: AppLocale) => {
      if (!managedLocalization) return;
      const safe = normalizeLocale(next);
      if (!locales.some((item) => item.locale === safe)) return;
      setLocaleState(safe);
      const direction =
        locales.find((item) => item.locale === safe)?.text_direction ||
        localeDirection(safe);
      document.documentElement.lang = safe;
      document.documentElement.dir = direction;
      try {
        localStorage.setItem("girlz-culture-locale", safe);
      } catch {}
      document.cookie = `gc_locale=${safe}; Path=/; Max-Age=31536000; SameSite=Lax`;
      void persistAccountLocale(safe);
    },
    [locales, persistAccountLocale, managedLocalization],
  );
  useEffect(() => {
    if (!managedLocalization) return;
    let saved = "";
    try {
      saved = localStorage.getItem("girlz-culture-locale") || "";
    } catch {}
    if (!saved || normalizeLocale(saved) === preferredLocale) return;
    const timer = window.setTimeout(
      () => setLocaleState(normalizeLocale(saved)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [managedLocalization]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!managedLocalization) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      let saved = "";
      try {
        saved = localStorage.getItem("girlz-culture-locale") || "";
      } catch {}
      if (saved) return;
      try {
        const { data } =
          await getSupabaseForScope(scopeForPath()).auth.getSession();
        const accountLocale = normalizeLocale(
          data.session?.user.user_metadata?.locale,
        );
        if (!cancelled && data.session?.user.user_metadata?.locale)
          setLocaleState(accountLocale);
      } catch {}
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [managedLocalization]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
    // Update this on route changes as the root layout persists during client
    // navigation. Do not observe or rewrite translated public text nodes.
    if (managedLocalization) document.body.removeAttribute("translate");
    else document.body.setAttribute("translate", "yes");
    const controller = new AbortController();
    void fetch(`/api/i18n?locale=${encodeURIComponent(locale)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (controller.signal.aborted) return;
        setTranslations({ locale,
          messages: body?.messages && typeof body.messages === "object" ? body.messages : {},
          sources: body?.sourceMessages && typeof body.sourceMessages === "object" ? body.sourceMessages : {},
        });
        if (Array.isArray(body?.locales) && body.locales.length) {
          setLocales(body.locales);
          document.documentElement.dir =
            body.locales.find((item: LocaleOption) => item.locale === locale)
              ?.text_direction || localeDirection(locale);
        }
        setCoverage({
          published: Number(body?.coverage?.published || 0),
          total: Number(body?.coverage?.total || 0),
          incomplete: body?.coverage?.incomplete === true,
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setTranslations({ locale, messages: {}, sources: {} });
        setCoverage({ published: 0, total: 0, incomplete: locale !== "en" });
      });
    return () => controller.abort();
  }, [locale, managedLocalization]);
  const t = useCallback(
    (
      key: string,
      fallback = "",
      values: Record<string, string | number> = {},
    ) => {
      // In English, founder-managed text supplied by the rendering surface is
      // authoritative unless a reviewed/published Engine override exists.
      // This keeps editable navigation and labels from being hidden by the
      // code fallback catalog. Other locales continue to prefer reviewed
      // translations and then use their safe bundled/English fallbacks.
      let text = locale === "en"
        ? remote[key] || fallback || ENGLISH_MESSAGES[key] || ""
        : remote[key] || BUNDLED_MESSAGES[locale]?.[key] || ENGLISH_MESSAGES[key] || fallback || "";
      for (const [name, value] of Object.entries(values))
        text = text.replaceAll(`{${name}}`, String(value));
      return text;
    },
    [locale, remote],
  );
  const direction =
    locales.find((item) => item.locale === locale)?.text_direction ||
    localeDirection(locale);
  const translateSource = useCallback(
    (source: string) =>
      resolveSourceTranslation(
        source,
        sourceMessages,
        DASHBOARD_SOURCE_MESSAGES[locale],
      ),
    [locale, sourceMessages],
  );
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      managedLocalization,
      locales,
      coverage,
      direction,
      setLocale,
      t,
      translateSource,
      formatDate: (input, options) =>
        new Intl.DateTimeFormat(intlLocale(locale), options).format(
          new Date(input),
        ),
      formatNumber: (input, options) =>
        new Intl.NumberFormat(intlLocale(locale), options).format(input),
      formatCurrency: (input, currency = "USD") =>
        new Intl.NumberFormat(intlLocale(locale), {
          style: "currency",
          currency,
        }).format(input),
      plural: (count, forms) =>
        new Intl.PluralRules(intlLocale(locale)).select(count) === "one"
          ? forms.one
          : forms.other,
    }),
    [locale, managedLocalization, locales, coverage, direction, setLocale, t, translateSource],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("useI18n must be used inside LocaleProvider.");
  return value;
}
