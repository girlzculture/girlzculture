"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import type { PublicNavigationGroup } from "@/lib/publicNavigation";

export default function PublicNavigationMenu({ group, active }: { group: PublicNavigationGroup; active?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={root} className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={`public-menu-${group.id}`} onClick={() => setOpen(value => !value)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 hover:bg-teal/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">
      {t(group.translation_key, group.label)}<ChevronDown aria-hidden="true" size={15} />
    </button>
    {open ? <div id={`public-menu-${group.id}`} className="absolute left-0 top-full z-10 min-w-56 rounded-2xl border border-teal/15 bg-white p-2 shadow-lg">
      {group.links.map(item => <Link key={item.item_key} href={item.href} aria-current={active === item.item_key ? "page" : undefined} onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-xl px-3 py-2 hover:bg-teal/5 focus-visible:outline-2 focus-visible:outline-teal">{t(item.translation_key || `navigation.${item.item_key}`, item.label)}</Link>)}
    </div> : null}
  </div>;
}
