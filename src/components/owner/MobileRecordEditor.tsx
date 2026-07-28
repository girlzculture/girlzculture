"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";

export default function MobileRecordEditor({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const mobileViewport = window.matchMedia("(max-width: 1023px)");
    let priorOverflow = "";
    let bodyLocked = false;
    const syncBodyLock = () => {
      if (mobileViewport.matches && !bodyLocked) {
        priorOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        bodyLocked = true;
        backRef.current?.focus();
      } else if (!mobileViewport.matches && bodyLocked) {
        document.body.style.overflow = priorOverflow;
        bodyLocked = false;
      }
    };
    syncBodyLock();
    mobileViewport.addEventListener("change", syncBodyLock);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      if (bodyLocked) document.body.style.overflow = priorOverflow;
      mobileViewport.removeEventListener("change", syncBodyLock);
      window.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [open]);

  return (
    <div
      className={`${open ? "fixed inset-0 z-[70] block overflow-y-auto bg-cream px-3 pb-28 pt-[max(12px,env(safe-area-inset-top))]" : "hidden"} lg:static lg:z-auto lg:block lg:overflow-visible lg:bg-transparent lg:p-0`}
      role={open ? "dialog" : undefined}
      aria-modal={open ? "true" : undefined}
      aria-label={open ? title : undefined}
    >
      <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-3 flex items-center gap-3 border-b border-plum/10 bg-cream/95 px-3 py-3 backdrop-blur lg:hidden">
        <button
          ref={backRef}
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-plum/15 bg-white px-4 text-xs font-bold text-plum"
        >
          <ArrowLeft size={17} />
          Back
        </button>
        <h2 className="min-w-0 truncate font-serif text-xl text-plum">{title}</h2>
      </div>
      {children}
    </div>
  );
}
