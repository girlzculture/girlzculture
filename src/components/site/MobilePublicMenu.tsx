"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import LanguageSelector from "@/components/i18n/LanguageSelector";

type LinkItem = {
  item_key: string;
  label: string;
  translation_key?: string | null;
  href: string;
};

export default function MobilePublicMenu({ links }: { links: LinkItem[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus)
      requestAnimationFrame(() => trigger.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() =>
      panel.current?.querySelector<HTMLAnchorElement>("a")?.focus(),
    );
    function closeOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) close(true);
    }
    function closeEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [close, open]);

  return (
    <div ref={root} className="relative xl:hidden">
      <button
        ref={trigger}
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-10 items-center justify-center rounded-[8px] border border-plum/10 px-2.5 text-xs font-bold text-ink"
      >
        {open ? "Close" : "Menu"}
      </button>
      {open ? (
        <nav
          ref={panel}
          aria-label="Mobile navigation"
          className="absolute left-0 top-12 z-50 w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-[14px] border border-plum/10 bg-white p-2 text-sm font-semibold text-ink shadow-[0_18px_42px_rgba(13,17,20,0.16)]"
        >
          <div className="mb-2 rounded-[10px] bg-blush/25 p-2">
            <LanguageSelector className="w-full justify-between bg-white" />
          </div>
          {links.map((item) => (
            <Link
              key={item.item_key}
              href={item.href}
              onClick={() => close(false)}
              className={`block rounded-[10px] px-4 py-3 hover:bg-blush/45 ${
                item.href === "/partner" ? "text-magenta" : ""
              }`}
            >
              {t(
                item.translation_key || `navigation.${item.item_key}`,
                item.label,
              )}
            </Link>
          ))}
          <div className="my-1 border-t border-plum/10" />
          <Link
            href="/login"
            onClick={() => close(false)}
            className="block rounded-[10px] px-4 py-3 hover:bg-blush/45"
          >
            {t("nav.login", "Log in")}
          </Link>
          <Link
            href="/login"
            onClick={() => close(false)}
            className="block rounded-[10px] bg-magenta px-4 py-3 text-center text-white"
          >
            {t("nav.signup", "Sign up")}
          </Link>
          <button
            type="button"
            onClick={() => close(true)}
            className="mt-2 min-h-10 w-full rounded-[8px] border border-plum/15 bg-white text-sm font-bold text-plum"
          >
            Close menu
          </button>
        </nav>
      ) : null}
    </div>
  );
}
