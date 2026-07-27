"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import SafeImage from "@/components/site/SafeImage";
import type { ContentCard } from "@/lib/content";
import { isPromotionCardActive } from "@/lib/homePromotionCore";

export default function HomepagePromoRail({
  cards,
  now,
}: {
  cards: ContentCard[];
  now: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const programmaticScroll = useRef(false);
  const [paused, setPaused] = useState(false);
  const currentTime = Date.parse(now);
  const visibleCards = useMemo(
    () => cards.filter((card) => isPromotionCardActive(card, currentTime)).slice(0, 8),
    [cards, currentTime],
  );

  function move(direction: -1 | 1, userInitiated = true) {
    const rail = railRef.current;
    if (!rail) return;
    if (userInitiated) setPaused(true);
    programmaticScroll.current = true;
    const card = rail.querySelector<HTMLElement>("[data-promotion-card]");
    rail.scrollBy({
      left: direction * ((card?.offsetWidth || rail.clientWidth * 0.75) + 14),
      behavior: "smooth",
    });
    window.setTimeout(() => {
      programmaticScroll.current = false;
    }, 700);
  }

  useEffect(() => {
    if (paused || visibleCards.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      const rail = railRef.current;
      if (!rail) return;
      const nearEnd =
        rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 12;
      if (nearEnd) {
        programmaticScroll.current = true;
        rail.scrollTo({ left: 0, behavior: "smooth" });
        window.setTimeout(() => {
          programmaticScroll.current = false;
        }, 700);
      } else {
        move(1, false);
      }
    }, 5500);
    return () => window.clearInterval(timer);
  }, [paused, visibleCards.length]);

  if (!visibleCards.length) return null;

  return (
    <section
      aria-label="Featured Girlz Culture promotions"
      className="relative mx-auto w-full max-w-[1760px] px-4 pb-5 sm:px-6 lg:px-10 xl:px-12 2xl:px-16"
    >
      <div
        ref={railRef}
        onPointerDown={() => setPaused(true)}
        onWheel={() => setPaused(true)}
        onScroll={() => {
          if (!programmaticScroll.current) setPaused(true);
        }}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [overscroll-behavior-inline:contain] [scrollbar-width:none] sm:-mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {visibleCards.map((card, index) => (
          <article
            data-promotion-card
            key={card.id || `${card.title}-${index}`}
            className="relative h-[222px] w-[82vw] max-w-[310px] shrink-0 snap-start overflow-hidden rounded-[18px] bg-charcoal shadow-[0_12px_28px_rgba(13,17,20,.13)] sm:w-[44vw] lg:w-[31vw] xl:w-[24vw] xl:max-w-none"
          >
            <SafeImage
              src={card.media_url}
              fallbackSrc="/images/hero-braids.jpg"
              alt={card.alt_text || card.title || "Girlz Culture promotion"}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4 text-white">
              {card.title ? (
                <h2 className="font-serif text-[23px] font-semibold leading-[.95]">
                  {card.title}
                </h2>
              ) : null}
              {card.body ? (
                <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-white/85">
                  {card.body}
                </p>
              ) : null}
              {card.href ? (
                <Link
                  href={card.href}
                  onClick={() => setPaused(true)}
                  className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-magenta px-4 text-[10px] font-bold text-white"
                >
                  {card.cta_label || "Explore"}
                </Link>
              ) : null}
            </div>
          </article>
        ))}
        <span className="w-1 shrink-0" aria-hidden="true" />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-[10px] text-ink/55">
          {paused
            ? "Automatic movement paused."
            : "Featured looks and local salon highlights."}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous promotion"
            onClick={() => move(-1)}
            className="grid min-h-11 min-w-11 place-items-center rounded-full border border-plum/15 bg-white text-plum"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next promotion"
            onClick={() => move(1)}
            className="grid min-h-11 min-w-11 place-items-center rounded-full border border-plum/15 bg-white text-plum"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
