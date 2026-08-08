"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import PublicContentCard from "@/components/site/PublicContentCard";
import type { ContentCard } from "@/lib/content";
import {
  isExplicitlyGlobalPromotionCard,
  selectLocalPromotionCards,
  uniquePromotionCards,
} from "@/lib/homePromotionCore";

export default function AutoContentCarousel({ cards, direction = "forward", label }: { cards: ContentCard[]; direction?: "forward" | "reverse"; label?: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pauseUntil = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [selectionTime] = useState(() => Date.now());
  const { location, ready } = useCustomerLocation();
  const visibleCards = useMemo(() => {
    const unique = uniquePromotionCards(cards);
    // Location restoration is asynchronous. Until it resolves, render only
    // content the founder explicitly configured for every market; otherwise a
    // targeted salon/campaign can flash for the wrong visitor.
    if (!ready) return unique.filter(isExplicitlyGlobalPromotionCard);
    return selectLocalPromotionCards({ cards: unique, now: selectionTime, customerLocation: location, limit: Math.min(20, unique.length || 1) });
  }, [cards, location, ready, selectionTime]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || reducedMotion || visibleCards.length < 2) return;
    if (direction === "reverse") viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth;
    const timer = window.setInterval(() => {
      if (Date.now() < pauseUntil.current || document.hidden) return;
      const firstCard = viewport.querySelector<HTMLElement>("[data-carousel-card]");
      const step = (firstCard?.offsetWidth || 280) + 16;
      const atEnd = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 4;
      const atStart = viewport.scrollLeft <= 4;
      if (direction === "reverse") viewport.scrollTo({ left: atStart ? viewport.scrollWidth : Math.max(0, viewport.scrollLeft - step), behavior: "smooth" });
      else viewport.scrollTo({ left: atEnd ? 0 : viewport.scrollLeft + step, behavior: "smooth" });
    }, 4200);
    return () => window.clearInterval(timer);
  }, [direction, reducedMotion, visibleCards.length]);

  function pause() { pauseUntil.current = Date.now() + 9000; }
  function move(delta: -1 | 1) {
    pause();
    const viewport = viewportRef.current;
    const card = viewport?.querySelector<HTMLElement>("[data-carousel-card]");
    viewport?.scrollBy({ left: delta * ((card?.offsetWidth || 280) + 16), behavior: reducedMotion ? "auto" : "smooth" });
  }

  if (!visibleCards.length) return null;
  return <div className="relative mt-4" aria-label={label || "Girlz Culture promotions"} role="region">
    <div className="mb-2 hidden justify-end gap-2 md:flex">
      <button type="button" onClick={() => move(-1)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-plum/15 bg-white text-plum" aria-label="Previous cards"><ChevronLeft size={18}/></button>
      <button type="button" onClick={() => move(1)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-plum/15 bg-white text-plum" aria-label="Next cards"><ChevronRight size={18}/></button>
    </div>
    <div ref={viewportRef} onPointerDown={pause} onWheel={pause} onFocus={pause} onMouseEnter={pause} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {visibleCards.map((card) => <div data-carousel-card key={card.id || `${card.href}-${card.media_url}`} className="w-[72vw] max-w-[340px] shrink-0 snap-start"><PublicContentCard card={card}/></div>)}
    </div>
  </div>;
}
