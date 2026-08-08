"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export default function AboutIntro({ title, preview, body, readMoreLabel = "Read more" }: { title: string; preview: string; body: string; readMoreLabel?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;
      const dialog = closeRef.current?.closest<HTMLElement>("[role=dialog]");
      const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>("button,a[href],[tabindex]:not([tabindex='-1'])") || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return <section className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-5 md:py-8">
    <article className="rounded-[18px] border border-plum/10 bg-white p-5 shadow-[0_8px_30px_rgba(13,17,20,.04)] md:border-0 md:bg-transparent md:p-0 md:shadow-none">
      <h2 className="font-serif text-2xl font-semibold text-plum sm:text-3xl">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-ink/70 md:hidden">{preview}</p>
      <p className="mt-3 hidden max-w-4xl whitespace-pre-wrap text-sm leading-7 text-ink/70 md:block">{body}</p>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className="mt-3 min-h-11 font-bold text-magenta md:hidden" aria-haspopup="dialog">{readMoreLabel} <span aria-hidden="true">→</span></button>
    </article>
    {open ? <div className="fixed inset-0 z-[150] flex items-end bg-ink/65 p-0 md:hidden" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="about-story-title" className="max-h-[82dvh] w-full overflow-y-auto rounded-t-[24px] bg-cream p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
        <div className="flex items-start justify-between gap-4"><h2 id="about-story-title" className="font-serif text-3xl text-plum">{title}</h2><button ref={closeRef} type="button" onClick={() => setOpen(false)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-plum/15 bg-white text-plum" aria-label="Close About story"><X size={20}/></button></div>
        <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-ink/75">{body}</p>
        <button type="button" onClick={() => setOpen(false)} className="mt-6 min-h-12 w-full rounded-xl bg-magenta px-5 text-sm font-bold text-white">Close</button>
      </section>
    </div> : null}
  </section>;
}
