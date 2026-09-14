"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { resolveSourceTranslation, resolveInterfaceMessage, interpolateInterfaceValues } from "@/lib/localizationCore";
import { DASHBOARD_SOURCE_MESSAGES } from "@/i18n/dashboard-source-catalog";
import { getSupabaseForScope, type AuthScope } from "@/lib/supabase";
import { usePathname } from "next/navigation";
import { localeStorageKey, preferredLocale, localeAuthScope } from "@/lib/localePreferenceCore";

type I18nContextValue = {
  locale: AppLocale;
  locales: LocaleOption[];
  coverage: { published: number; total: number; incomplete: boolean };
  preferenceError: boolean;
  direction: "ltr" | "rtl";
  setLocale: (locale: AppLocale) => void;
  t: (
    key: string,
    fallback?: string,
    values?: Record<string, string | number>,
  ) => string;
  translateSource: (source: string, values?: Record<string, string | number>) => string;
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
  { locale: "zh-CN", display_name: "Chinese (Simplified)", native_name: "中文（简体）", intl_locale: "zh-CN", text_direction: "ltr", sort_order: 5 },
];
export default function LocaleProvider({
  children,
  initialLocale = "en",
}: {
  children: React.ReactNode;
  initialLocale?: string;
}) {
  const pathname = usePathname();
  const scope: AuthScope = localeAuthScope(pathname || "/", typeof window === "undefined" ? "" : window.location.hostname);
  const actor = useRef<string | null>(null);
  const selection = useRef(0);
  const saves = useRef(Promise.resolve());
  const [preferenceError, setPreferenceError] = useState(false);
  const [locale, setLocaleState] = useState<AppLocale>(() =>
    normalizeLocale(initialLocale),
  );
  const [remote, setRemote] = useState<Record<string, string>>({});
  const [sourceMessages, setSourceMessages] = useState<Record<string, string>>(
    {},
  );
  const [locales, setLocales] = useState<LocaleOption[]>(FALLBACK_LOCALES);
  const [coverage, setCoverage] = useState({ published: 0, total: 0, incomplete: false });
  const persistAccountLocale = useCallback(async (safe: string, version: number, targetActor: string | null) => {
    try {
      const client = getSupabaseForScope(scope);
      const { data } = await client.auth.getSession();
      if (!data.session || data.session.user.id !== targetActor) return;
      const response = await fetch("/api/i18n/preference", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ locale: safe }),
      });
      if (!response.ok) throw new Error("LOCALE_SAVE_FAILED");
      if (version === selection.current) setPreferenceError(false);
    } catch {
      if (version === selection.current) setPreferenceError(true);
    }
  }, [scope]);
  const setLocale = useCallback(
    (next: AppLocale) => {
      const safe = normalizeLocale(next);
      if (!locales.some((item) => item.locale === safe)) return;
      const version = ++selection.current;
      setLocaleState(safe);
      const direction =
        locales.find((item) => item.locale === safe)?.text_direction ||
        localeDirection(safe);
      document.documentElement.lang = safe;
      document.documentElement.dir = direction;
      try {
        localStorage.setItem(localeStorageKey(scope, actor.current), safe);
      } catch {}
      document.cookie = `gc_locale=${safe}; Path=/; Max-Age=31536000; SameSite=Lax`;
      const targetActor = actor.current;
      saves.current = saves.current.then(() => persistAccountLocale(safe, version, targetActor));
    },
    [locales, persistAccountLocale, scope],
  );
  useEffect(() => {
    let active = true; let generation = 0;
    const client = getSupabaseForScope(scope);
    async function restore() {
      const serial = ++generation; const version = selection.current;
      try {
        const { data } = await client.auth.getSession();
        const userId = data.session?.user.id || null;
        const fresh = userId ? await client.auth.getUser() : null;
        if (!active || serial !== generation || version !== selection.current) return;
        actor.current = userId;
        const accountLocale = fresh?.data.user?.user_metadata?.locale || data.session?.user.user_metadata?.locale;
        let cached: string | null = null; try { cached = localStorage.getItem(localeStorageKey(scope, userId)); } catch {}
        setLocaleState(preferredLocale({ userId, accountLocale, accountCachedLocale: userId ? cached : null, anonymousLocale: userId ? null : cached, fallback: userId ? "en" : initialLocale }));
        setPreferenceError(false);
      } catch {}
    }
    const timer = window.setTimeout(() => void restore(), 0);
    const listener = client.auth.onAuthStateChange((event, session) => {
      // Schedule outside Supabase's auth lock; never await auth in its callback.
      if (event === "TOKEN_REFRESHED" && actor.current === session?.user.id) return;
      if (actor.current !== (session?.user.id || null)) { actor.current = session?.user.id || null; selection.current++; }
      window.setTimeout(() => { if (active) void restore(); }, 0);
    });
    return () => { active = false; generation++; window.clearTimeout(timer); listener.data.subscription.unsubscribe(); };
  }, [scope, initialLocale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
    const controller = new AbortController();
    void fetch(`/api/i18n?locale=${encodeURIComponent(locale)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (controller.signal.aborted) return;
        // Never apply an English/default response or an earlier request over
        // the language the user has just selected.
        const sameLocale = !body?.locale || body.locale === locale;
        setRemote(
          sameLocale && body?.messages && typeof body.messages === "object"
            ? body.messages
            : {},
        );
        setSourceMessages(
          sameLocale && body?.sourceMessages && typeof body.sourceMessages === "object"
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
        if (controller.signal.aborted) return;
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
      const text = resolveInterfaceMessage({ locale, key, fallback, remote, english: ENGLISH_MESSAGES, bundled: BUNDLED_MESSAGES[locale], sourceMessages, sourceCatalog: DASHBOARD_SOURCE_MESSAGES[locale] });
      return interpolateInterfaceValues(text, values);
    },
    [locale, remote, sourceMessages],
  );
  const direction =
    locales.find((item) => item.locale === locale)?.text_direction ||
    localeDirection(locale);
  const translateSource = useCallback(
    (source: string, values: Record<string, string | number> = {}) =>
      interpolateInterfaceValues(resolveSourceTranslation(
        source,
        sourceMessages,
        DASHBOARD_SOURCE_MESSAGES[locale],
      ), values),
    [locale, sourceMessages],
  );
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      locales,
      coverage,
      preferenceError,
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
    [locale, locales, coverage, preferenceError, direction, setLocale, t, translateSource],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("useI18n must be used inside LocaleProvider.");
  return value;
}
