"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BUNDLED_MESSAGES,
  ENGLISH_MESSAGES,
  intlLocale,
  localeDirection,
  normalizeLocale,
  type AppLocale,
  type LocaleOption,
} from "@/i18n/catalog";
import { getSupabaseForScope, type AuthScope } from "@/lib/supabase";

type I18nContextValue = {
  locale: AppLocale;
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
}: {
  children: React.ReactNode;
  initialLocale?: string;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(() =>
    normalizeLocale(initialLocale),
  );
  const [remote, setRemote] = useState<Record<string, string>>({});
  const [sourceMessages, setSourceMessages] = useState<Record<string, string>>(
    {},
  );
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
    [locales, persistAccountLocale],
  );
  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem("girlz-culture-locale") || "";
    } catch {}
    if (!saved || normalizeLocale(saved) === locale) return;
    const timer = window.setTimeout(
      () => setLocaleState(normalizeLocale(saved)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
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
        if (data.session?.user.user_metadata?.locale)
          setLocaleState(accountLocale);
      } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
    const controller = new AbortController();
    void fetch(`/api/i18n?locale=${encodeURIComponent(locale)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        setRemote(
          body?.messages && typeof body.messages === "object"
            ? body.messages
            : {},
        );
        setSourceMessages(
          body?.sourceMessages && typeof body.sourceMessages === "object"
            ? body.sourceMessages
            : {},
        );
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
        setRemote({});
        setSourceMessages({});
        setCoverage({ published: 0, total: 0, incomplete: locale !== "en" });
      });
    return () => controller.abort();
  }, [locale]);
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
      sourceMessages[source.replace(/\s+/g, " ").trim()] || source,
    [sourceMessages],
  );
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
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
    [locale, locales, coverage, direction, setLocale, t, translateSource],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("useI18n must be used inside LocaleProvider.");
  return value;
}
