"use client";

import Link from "next/link";
import { Menu, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type DashboardMobileMenuItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
  count?: number;
};

export default function DashboardMobileMenu({
  items,
  ariaLabel,
}: {
  items: DashboardMobileMenuItem[];
  ariaLabel: string;
}) {
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
    const firstLink = panel.current?.querySelector<HTMLAnchorElement>("a");
    requestAnimationFrame(() => firstLink?.focus());
    function pointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) close(true);
    }
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("keydown", keyDown);
    };
  }, [close, open]);

  return (
    <div ref={root} className="relative lg:hidden">
      <button
        ref={trigger}
        type="button"
        aria-label={open ? `Close ${ariaLabel}` : `Open ${ariaLabel}`}
        aria-expanded={open}
        aria-controls={`${ariaLabel.replace(/\W+/g, "-").toLowerCase()}-panel`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-plum hover:bg-blush/40"
      >
        {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
      </button>
      {open ? (
        <nav
          ref={panel}
          id={`${ariaLabel.replace(/\W+/g, "-").toLowerCase()}-panel`}
          aria-label={ariaLabel}
          className="absolute left-0 top-12 z-50 max-h-[calc(100vh-7rem)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-[14px] border border-plum/10 bg-white p-2 shadow-2xl"
        >
          <div className="mb-1 flex items-center justify-between px-3 py-2">
            <b className="font-serif text-lg text-plum">Navigation</b>
            <button
              type="button"
              aria-label={`Close ${ariaLabel}`}
              onClick={() => close(true)}
              className="grid h-10 w-10 place-items-center rounded-lg hover:bg-blush/40"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                onClick={() => close(false)}
                className={`flex min-h-11 items-center gap-3 rounded-[9px] px-3 py-3 text-sm ${
                  item.active ? "bg-blush text-magenta" : "hover:bg-blush/30"
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
                {item.count ? (
                  <span className="ml-auto rounded-full bg-magenta px-2 py-0.5 text-[9px] font-bold text-white">
                    {Math.min(item.count, 99)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
