"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";

type LinkItem={item_key:string;label:string;translation_key?:string|null;href:string};

export default function MobilePublicMenu({links}:{links:LinkItem[]}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function closeOutside(event: PointerEvent) { if (open && !root.current?.contains(event.target as Node)) setOpen(false); }
    function closeEscape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);
  return <div ref={root} className="relative md:hidden"><button type="button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink">{open ? <X size={22}/> : <Menu size={22}/>}</button>{open ? <nav aria-label="Mobile navigation" className="absolute left-0 top-12 w-64 overflow-hidden rounded-[14px] border border-plum/10 bg-[#fffdfa] p-2 text-sm font-semibold text-ink shadow-[0_18px_42px_rgba(26,18,32,0.16)]">{links.map(item => <Link key={item.item_key} href={item.href} onClick={() => setOpen(false)} className={`block rounded-[10px] px-4 py-3 hover:bg-blush/45 ${item.href === "/partner" ? "text-magenta" : ""}`}>{t(item.translation_key||`navigation.${item.item_key}`,item.label)}</Link>)}<div className="my-1 border-t border-plum/10"/><Link href="/login" onClick={() => setOpen(false)} className="block rounded-[10px] px-4 py-3 hover:bg-blush/45">{t("nav.login","Log in")}</Link><Link href="/login" onClick={() => setOpen(false)} className="block rounded-[10px] bg-magenta px-4 py-3 text-center text-white">{t("nav.signup","Sign up")}</Link></nav> : null}</div>;
}
