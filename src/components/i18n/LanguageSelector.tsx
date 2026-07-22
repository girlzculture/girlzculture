"use client";

import type { FormEvent } from "react";
import { Languages } from "lucide-react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import type { AppLocale } from "@/i18n/catalog";

export default function LanguageSelector({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { locale, locales, setLocale, t } = useI18n();
  const handleInput = (event: FormEvent<HTMLSelectElement>) => {
    setLocale(event.currentTarget.value as AppLocale);
  };

  return (
    <label
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-plum/15 bg-white/80 px-2 text-[10px] font-bold text-plum ${className}`}
    >
      <Languages size={14} />
      <span className={compact ? "sr-only" : "hidden xl:inline"}>
        {t("common.select_language", "Select language")}
      </span>
      <select
        aria-label={t("common.select_language", "Select language")}
        value={locale}
        onChange={handleInput}
        onInput={handleInput}
        className="max-w-36 bg-transparent outline-none"
      >
        {locales.map((item) => (
          <option key={item.locale} value={item.locale}>
            {item.native_name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LocalizedText({
  messageKey,
  fallback,
  values,
}: {
  messageKey: string;
  fallback: string;
  values?: Record<string, string | number>;
}) {
  const { t } = useI18n();
  return <>{t(messageKey, fallback, values)}</>;
}
