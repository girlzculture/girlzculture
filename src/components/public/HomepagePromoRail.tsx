"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import SafeImage from "@/components/site/SafeImage";
import type { ContentCard } from "@/lib/content";
import { isPromotionCardActive } from "@/lib/homePromotionCore";

const ACCEPTANCE_MODE =
  process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS === "true";
const AUTO_INTERVAL_MS = ACCEPTANCE_MODE ? 850 : 5_500;
const RESUME_AFTER_MS = ACCEPTANCE_MODE ? 1_600 : 8_000;

export default function HomepagePromoRail({
  cards,
  now,
}: {
  cards: ContentCard[];
  now: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const programmaticScroll = useRef(false);
  const interactionTimer = useRef<number | null>(null);
  const scrollTimer = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [railVisible, setRailVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const currentTime = Date.parse(now);
  const visibleCards = useMemo(
    () =>
      cards
        .filter((card) => isPromotionCardActive(card, currentTime))
        .slice(0, 8),
    [cards, currentTime],
  );
  const canAutomaticallyMove =
    visibleCards.length > 1 &&
    railVisible &&
    documentVisible &&
    !interactionPaused &&
    !reducedMotion;

  function cardElements() {
    return Array.from(
      railRef.current?.querySelectorAll<HTMLElement>(
        "[data-promotion-card], [data-promotion-clone]",
      ) || [],
    );
  }

  function scrollToIndex(index: number, behavior: ScrollBehavior = "smooth") {
    const rail = railRef.current;
    const targets = cardElements();
    const target = targets[index];
    if (!rail || !target) return;
    programmaticScroll.current = true;
    rail.scrollTo({
      left: target.offsetLeft - rail.offsetLeft,
      behavior: reducedMotion ? "auto" : behavior,
    });
    if (index === visibleCards.length) {
      window.setTimeout(() => {
        rail.scrollTo({ left: 0, behavior: "auto" });
        setCurrentIndex(0);
        programmaticScroll.current = false;
      }, reducedMotion ? 0 : 700);
    } else {
      setCurrentIndex(index);
      window.setTimeout(() => {
        programmaticScroll.current = false;
      }, reducedMotion ? 0 : 700);
    }
  }

  function pauseForInteraction() {
    setInteractionPaused(true);
    if (interactionTimer.current)
      window.clearTimeout(interactionTimer.current);
    interactionTimer.current = window.setTimeout(() => {
      setInteractionPaused(false);
    }, RESUME_AFTER_MS);
  }

  function move(direction: -1 | 1, userInitiated = true) {
    if (!visibleCards.length) return;
    if (userInitiated) pauseForInteraction();
    const next =
      direction === 1
        ? currentIndex === visibleCards.length - 1
          ? visibleCards.length
          : currentIndex + 1
        : currentIndex === 0
          ? visibleCards.length - 1
          : currentIndex - 1;
    scrollToIndex(next);
  }

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    updateMotion();
    media.addEventListener("change", updateMotion);
    const updateVisibility = () =>
      setDocumentVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      media.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const observer = new IntersectionObserver(
      ([entry]) => setRailVisible(entry.isIntersecting && entry.intersectionRatio > 0.25),
      { threshold: [0, 0.25, 0.6] },
    );
    observer.observe(rail);
    return () => observer.disconnect();
  }, [visibleCards.length]);

  useEffect(() => {
    if (!canAutomaticallyMove) return;
    const timer = window.setInterval(() => move(1, false), AUTO_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [canAutomaticallyMove, currentIndex, visibleCards.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      if (interactionTimer.current)
        window.clearTimeout(interactionTimer.current);
      if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    },
    [],
  );

  if (!visibleCards.length) return null;
  const clone = visibleCards[0];

  return (
    <section
      aria-label="Featured Girlz Culture promotions"
      data-promotion-rail
      data-current-index={currentIndex}
      data-auto-state={
        reducedMotion
          ? "reduced-motion"
          : canAutomaticallyMove
            ? "running"
            : "paused"
      }
      className="relative w-full pb-2 pt-2 sm:pb-3 sm:pt-3"
    >
      <p className="sr-only" aria-live="polite">
        Promotion {currentIndex + 1} of {visibleCards.length}
      </p>
      <div
        ref={railRef}
        tabIndex={0}
        aria-label="Promotional cards. Swipe to browse."
        onFocus={() => setInteractionPaused(true)}
        onBlur={pauseForInteraction}
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
          dragged.current = false;
          pauseForInteraction();
        }}
        onPointerMove={(event) => {
          if (!pointerStart.current) return;
          if (
            Math.hypot(
              event.clientX - pointerStart.current.x,
              event.clientY - pointerStart.current.y,
            ) > 8
          ) {
            dragged.current = true;
          }
        }}
        onPointerUp={() => {
          pointerStart.current = null;
          pauseForInteraction();
          window.setTimeout(() => {
            dragged.current = false;
          }, 80);
        }}
        onPointerCancel={() => {
          pointerStart.current = null;
          dragged.current = false;
          pauseForInteraction();
        }}
        onWheel={pauseForInteraction}
        onScroll={() => {
          if (programmaticScroll.current) return;
          pauseForInteraction();
          if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
          scrollTimer.current = window.setTimeout(() => {
            const rail = railRef.current;
            if (!rail) return;
            const targets = cardElements().slice(0, visibleCards.length);
            const closest = targets.reduce(
              (best, target, index) => {
                const distance = Math.abs(
                  target.offsetLeft - rail.offsetLeft - rail.scrollLeft,
                );
                return distance < best.distance
                  ? { index, distance }
                  : best;
              },
              { index: 0, distance: Number.POSITIVE_INFINITY },
            );
            setCurrentIndex(closest.index);
          }, 100);
        }}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [overscroll-behavior-inline:contain] [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {visibleCards.map((card, index) => (
          <PromotionCard
            key={card.id || `${card.title}-${index}`}
            card={card}
            onNavigate={(event) => {
              if (dragged.current) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              pauseForInteraction();
            }}
          />
        ))}
        <article
          data-promotion-clone
          aria-hidden="true"
          className="gc-promotion-card relative h-[214px] w-[calc(100vw-52px)] max-w-[360px] shrink-0 snap-start overflow-hidden rounded-[18px] bg-charcoal shadow-[0_12px_28px_rgba(13,17,20,.13)] sm:h-[222px] sm:w-[62vw] sm:max-w-[420px] md:w-[45vw] lg:h-[232px] lg:w-[31vw] lg:max-w-[470px] xl:w-[24vw]"
        >
          <SafeImage
            src={clone.media_url}
            fallbackSrc="/images/hero-braids.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            {clone.title ? (
              <h2 className="font-serif text-[23px] font-semibold leading-[.95]">
                {clone.title}
              </h2>
            ) : null}
            {clone.body ? (
              <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-white/85">
                {clone.body}
              </p>
            ) : null}
            {clone.href ? (
              <span className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-magenta px-4 text-[10px] font-bold text-white">
                {clone.cta_label || "Explore"}
              </span>
            ) : null}
          </div>
        </article>
        <span className="w-1 shrink-0" aria-hidden="true" />
      </div>
      <div className="mt-1 hidden items-center justify-end gap-2 lg:flex">
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
    </section>
  );
}

function PromotionCard({
  card,
  onNavigate,
}: {
  card: ContentCard;
  onNavigate: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <article
      data-promotion-card
      className="gc-promotion-card relative h-[214px] w-[calc(100vw-52px)] max-w-[360px] shrink-0 snap-start overflow-hidden rounded-[18px] bg-charcoal shadow-[0_12px_28px_rgba(13,17,20,.13)] sm:h-[222px] sm:w-[62vw] sm:max-w-[420px] md:w-[45vw] lg:h-[232px] lg:w-[31vw] lg:max-w-[470px] xl:w-[24vw]"
    >
      <SafeImage
        src={card.media_url}
        fallbackSrc="/images/hero-braids.jpg"
        alt={card.alt_text || card.title || "Girlz Culture promotion"}
        draggable={false}
        className="absolute inset-0 h-full w-full select-none object-cover"
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
            draggable={false}
            onClick={onNavigate}
            className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-magenta px-4 text-[10px] font-bold text-white"
          >
            {card.cta_label || "Explore"}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
