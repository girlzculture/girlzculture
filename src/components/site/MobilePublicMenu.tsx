"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import LanguageSelector from "@/components/i18n/LanguageSelector";

import type { PublicNavigationGroup } from "@/lib/publicNavigation";

const subscribeToHydration = () => () => {};
const clientIsInteractive = () => true;
const serverIsInteractive = () => false;

export default function MobilePublicMenu({groups}:{groups:PublicNavigationGroup[]}) {
  const { t, translateSource } = useI18n();
  // SSR exposes the menu before its click handler exists. Enable the control
  // only after this component hydrates, so the first click cannot be lost.
  const interactive = useSyncExternalStore(subscribeToHydration, clientIsInteractive, serverIsInteractive);
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
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("summary, a")?.focus());
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
  return <div ref={root} className="relative 2xl:hidden"><button ref={trigger} type="button" disabled={!interactive} aria-label={translateSource(open ? "Close navigation menu" : "Open navigation menu")} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink gc-disabled-control">{open ? <X size={22}/> : <Menu size={22}/>}</button>{open ? <nav ref={panel} aria-label="Mobile navigation" data-public-mobile-menu className="absolute left-0 top-12 max-h-[calc(100dvh-4.5rem)] w-72 overflow-x-hidden overflow-y-auto rounded-[14px] border border-plum/10 bg-white p-2 text-sm font-semibold text-ink shadow-[0_18px_42px_rgba(13,17,20,0.16)]"><div className="mb-2 rounded-[10px] bg-blush/25 p-2"><LanguageSelector className="w-full justify-between bg-white" /></div>{groups.map(group => <details key={group.id} className="rounded-xl"><summary className="flex min-h-12 cursor-pointer items-center rounded-xl px-4 hover:bg-teal/5">{t(group.translation_key, group.label)}</summary><div className="mb-1 border-l border-teal/20 pl-3">{group.links.map(item => <Link key={item.item_key} href={item.href} onClick={() => close(false)} className="block rounded-xl px-4 py-3 hover:bg-teal/5">{t(item.translation_key || `navigation.${item.item_key}`, item.label)}</Link>)}</div></details>)}<Link href="/how-it-works" onClick={() => close(false)} className="block rounded-xl px-4 py-3 hover:bg-teal/5">{t("nav.how", "How It Works")}</Link><div className="my-1 border-t border-plum/10"/><Link href="/login" onClick={() => close(false)} className="block rounded-[10px] px-4 py-3 hover:bg-blush/45">{t("nav.login","Log in")}</Link><Link href="/login" onClick={() => close(false)} className="block rounded-[10px] bg-magenta px-4 py-3 text-center text-white">{t("nav.signup","Sign up")}</Link></nav> : null}</div>;
}
