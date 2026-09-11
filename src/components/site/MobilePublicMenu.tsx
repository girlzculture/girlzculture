"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";

type LinkItem={item_key:string;label:string;translation_key?:string|null;href:string};

export default function MobilePublicMenu({links}:{links:LinkItem[]}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => trigger.current?.focus());
  }, []);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => panel.current?.querySelector<HTMLAnchorElement>("a")?.focus());
    function closeOutside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) close(true); }
    function closeEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [close, open]);
  return <div ref={root} className="relative 2xl:hidden">
    <button ref={trigger} type="button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} onClick={() => setOpen(value => !value)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink">
      {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
    </button>
    {open ? <nav ref={panel} aria-label="Mobile navigation" translate="yes" data-public-translation="true" data-public-mobile-menu className="absolute left-0 top-12 max-h-[calc(100dvh-4.5rem)] w-72 overflow-x-hidden overflow-y-auto rounded-[14px] border border-plum/10 bg-white p-2 text-sm font-semibold text-ink shadow-[0_18px_42px_rgba(13,17,20,0.16)]">
      {links.map(item => <Link key={item.item_key} href={item.href} onClick={() => close(false)} className={`block rounded-[10px] px-4 py-3 hover:bg-blush/45 ${item.href === "/partner" ? "text-magenta" : ""}`}><span>{t(item.translation_key || `navigation.${item.item_key}`, item.label)}</span></Link>)}
      <div className="my-1 border-t border-plum/10" />
      <Link href="/login" onClick={() => close(false)} className="block rounded-[10px] px-4 py-3 hover:bg-blush/45"><span>{t("nav.login", "Log in")}</span></Link>
      <Link href="/login" onClick={() => close(false)} className="block rounded-[10px] bg-magenta px-4 py-3 text-center text-white"><span>{t("nav.signup", "Sign up")}</span></Link>
    </nav> : null}
  </div>;
}
