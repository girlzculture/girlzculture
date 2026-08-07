"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export type DashboardMobileMenuItem = {
  id: string;
  label: string;
  href: string;
  icon?: unknown;
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
    if (returnFocus)
      requestAnimationFrame(() => trigger.current?.focus());
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
        className="flex min-h-11 items-center justify-center rounded-[8px] border border-plum/10 px-3 text-sm font-bold text-plum hover:bg-blush/40"
      >
        {open ? "Close" : "Menu"}
      </button>
      {open ? (
        <nav
          ref={panel}
          id={`${ariaLabel.replace(/\W+/g, "-").toLowerCase()}-panel`}
          aria-label={ariaLabel}
          className="absolute left-0 top-12 z-50 max-h-[calc(100vh-7rem)] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[14px] border border-plum/10 bg-white p-2 shadow-2xl"
        >
          <div className="mb-1 flex items-center justify-between gap-3 px-3 py-2">
            <b className="font-serif text-lg text-plum">Navigation</b>
            <button
              type="button"
              aria-label={`Close ${ariaLabel}`}
              onClick={() => close(true)}
              className="min-h-10 rounded-[8px] border border-plum/10 px-3 text-sm font-bold text-plum hover:bg-blush/40"
            >
              Close
            </button>
          </div>
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              onClick={() => close(false)}
              className={`flex min-h-11 items-center rounded-[9px] px-3 py-3 text-sm font-semibold ${
                item.active
                  ? "bg-blush text-magenta"
                  : "hover:bg-blush/30"
              }`}
            >
              {item.label}
              {item.count ? (
                <span className="ml-auto rounded-full bg-magenta px-2 py-0.5 text-[11px] font-bold text-white">
                  {Math.min(item.count, 99)}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
