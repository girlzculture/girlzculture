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

const ACCEPTANCE_MODE =
  process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS === "true";
const PIXELS_PER_FRAME = ACCEPTANCE_MODE ? 2.4 : 0.55;
const RESUME_AFTER_MS = ACCEPTANCE_MODE ? 900 : 7_000;

export default function AutoContentCarousel({
  cards,
  direction = "forward",
  label,
  sectionId,
}: {
  cards: ContentCard[];
  direction?: "forward" | "reverse";
  label?: string;
  sectionId?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const pauseTimer = useRef<number | null>(null);
  const lastIndex = useRef(0);
  const frameCounter = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [carouselVisible, setCarouselVisible] = useState(false);
  const [selectionTime] = useState(() => Date.now());
  const { location, ready } = useCustomerLocation();

  const visibleCards = useMemo(() => {
    const unique = uniquePromotionCards(cards);
    if (!ready) {
      return unique.filter(isExplicitlyGlobalPromotionCard).slice(0, 8);
    }
    return selectLocalPromotionCards({
      cards: unique,
      now: selectionTime,
      customerLocation: location,
      limit: Math.min(8, unique.length || 1),
    });
  }, [cards, location, ready, selectionTime]);
  const loopCards = useMemo(
    () =>
      visibleCards.length > 1
        ? [...visibleCards, ...visibleCards]
        : visibleCards,
    [visibleCards],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    const syncVisibility = () => setDocumentVisible(!document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setCarouselVisible(
          entry.isIntersecting && entry.intersectionRatio > 0.15,
        ),
      { threshold: [0, 0.15, 0.55] },
    );
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [visibleCards.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || visibleCards.length < 2) return;
    const initialize = window.requestAnimationFrame(() => {
      const half = viewport.scrollWidth / 2;
      if (direction === "reverse" && half > 0) viewport.scrollLeft = half;
    });
    return () => window.cancelAnimationFrame(initialize);
  }, [direction, visibleCards.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (
      !viewport ||
      reducedMotion ||
      paused ||
      !documentVisible ||
      !carouselVisible ||
      visibleCards.length < 2
    ) {
      return;
    }

    const tick = () => {
      const half = viewport.scrollWidth / 2;
      if (half > 0) {
        viewport.scrollLeft +=
          direction === "reverse" ? -PIXELS_PER_FRAME : PIXELS_PER_FRAME;
        if (direction === "forward" && viewport.scrollLeft >= half) {
          viewport.scrollLeft -= half;
        } else if (direction === "reverse" && viewport.scrollLeft <= 0) {
          viewport.scrollLeft += half;
        }
        frameCounter.current += 1;
        if (frameCounter.current % 20 === 0) {
          const firstCycle = Array.from(
            viewport.querySelectorAll<HTMLElement>("[data-carousel-card]"),
          ).slice(0, visibleCards.length);
          const logicalLeft =
            direction === "reverse" && viewport.scrollLeft >= half
              ? viewport.scrollLeft - half
              : viewport.scrollLeft;
          const closest = firstCycle.reduce(
            (best, card, index) => {
              const distance = Math.abs(card.offsetLeft - logicalLeft);
              return distance < best.distance ? { index, distance } : best;
            },
            { index: 0, distance: Number.POSITIVE_INFINITY },
          );
          if (closest.index !== lastIndex.current) {
            lastIndex.current = closest.index;
            setCurrentIndex(closest.index);
          }
        }
      }
      animationRef.current = window.requestAnimationFrame(tick);
    };
    animationRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationRef.current)
        window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [
    carouselVisible,
    direction,
    documentVisible,
    paused,
    reducedMotion,
    visibleCards.length,
  ]);

  function pause(resume = true) {
    setPaused(true);
    if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
    if (resume) {
      pauseTimer.current = window.setTimeout(
        () => setPaused(false),
        RESUME_AFTER_MS,
      );
    }
  }

  function move(delta: -1 | 1) {
    pause();
    const viewport = viewportRef.current;
    if (!viewport || !visibleCards.length) return;
    const next =
      (currentIndex + delta + visibleCards.length) % visibleCards.length;
    const targets = viewport.querySelectorAll<HTMLElement>(
      "[data-carousel-card]",
    );
    const target =
      targets[next + (direction === "reverse" ? visibleCards.length : 0)] ||
      targets[next];
    viewport.scrollTo({
      left: target?.offsetLeft || 0,
      behavior: reducedMotion ? "auto" : "smooth",
    });
    lastIndex.current = next;
    setCurrentIndex(next);
  }

  useEffect(
    () => () => {
      if (animationRef.current)
        window.cancelAnimationFrame(animationRef.current);
      if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
    },
    [],
  );

  if (!visibleCards.length) return null;
  return (
    <div
      className="relative mt-3"
      aria-label={label || "Girlz Culture promotions"}
      role="region"
      data-auto-content-carousel
      data-section-id={sectionId || ""}
      data-carousel-direction={direction}
      data-current-index={currentIndex}
      data-auto-state={
        reducedMotion
          ? "reduced-motion"
          : paused
            ? "paused"
            : documentVisible && carouselVisible && visibleCards.length > 1
              ? "running"
              : "idle"
      }
    >
      <p className="sr-only" aria-live="polite">
        Promotion {currentIndex + 1} of {visibleCards.length}
      </p>
      <div className="mb-2 hidden justify-end gap-2 lg:flex">
        <button
          type="button"
          onClick={() => move(-1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-plum/15 bg-white text-plum"
          aria-label="Previous cards"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-plum/15 bg-white text-plum"
          aria-label="Next cards"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div
        ref={viewportRef}
        tabIndex={0}
        onPointerDown={() => pause(false)}
        onPointerUp={() => pause()}
        onPointerCancel={() => pause()}
        onWheel={() => pause()}
        onFocusCapture={() => pause()}
        onBlurCapture={() => pause()}
        className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 [overscroll-behavior-inline:contain] [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {loopCards.map((card, index) => (
          <div
            data-carousel-card
            key={`${index >= visibleCards.length ? "loop" : "primary"}-${card.id || card.href || card.media_url}-${index}`}
            aria-hidden={index >= visibleCards.length ? "true" : undefined}
            inert={index >= visibleCards.length ? true : undefined}
            className="w-[46vw] min-w-[158px] max-w-[210px] shrink-0 sm:w-[31vw] sm:max-w-[245px] md:w-[27vw] lg:w-[22vw] lg:max-w-[320px]"
          >
            <PublicContentCard card={card} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
