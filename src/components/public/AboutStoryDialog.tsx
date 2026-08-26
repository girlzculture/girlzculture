"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

export default function AboutStoryDialog({
  title,
  body,
  label = "Read more",
  className = "",
}: {
  title: string;
  body: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = closeRef.current?.closest<HTMLElement>("[role=dialog]");
      const focusable = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button,a[href],[tabindex]:not([tabindex='-1'])",
        ) || [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  if (!body.trim()) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-haspopup="dialog"
      >
        {label} <span aria-hidden="true">→</span>
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[150] flex items-end bg-ink/65 p-0 sm:items-center sm:justify-center sm:p-5"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[82dvh] w-full overflow-y-auto rounded-t-[24px] bg-cream p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-2xl sm:rounded-[24px] sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id={titleId} className="font-serif text-3xl text-plum">
                {title}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-plum/15 bg-white text-plum"
                aria-label={`Close ${title}`}
              >
                <X size={20} />
              </button>
            </div>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-ink/75">
              {body}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 min-h-12 w-full rounded-xl bg-magenta px-5 text-sm font-bold text-white"
            >
              Close
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
