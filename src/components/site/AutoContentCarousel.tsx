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

const ACCEPTANCE_MODE = process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS === "true";
const AUTO_INTERVAL_MS = ACCEPTANCE_MODE ? 850 : 4_200;
const RESUME_AFTER_MS = ACCEPTANCE_MODE ? 900 : 9_000;

export default function AutoContentCarousel({ cards, direction = "forward", label, sectionId }: { cards: ContentCard[]; direction?: "forward" | "reverse"; label?: string; sectionId?: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pauseTimer = useRef<number | null>(null);
  const scrollTimer = useRef<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [carouselVisible, setCarouselVisible] = useState(false);
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
      ([entry]) => setCarouselVisible(entry.isIntersecting && entry.intersectionRatio > 0.2),
      { threshold: [0, 0.2, 0.6] },
    );
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [visibleCards.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || reducedMotion || paused || !documentVisible || !carouselVisible || visibleCards.length < 2) return;
    const timer = window.setInterval(() => {
      setCurrentIndex((current) => {
        const next = direction === "reverse"
          ? current === 0 ? visibleCards.length - 1 : current - 1
          : (current + 1) % visibleCards.length;
        const targets = viewport.querySelectorAll<HTMLElement>("[data-carousel-card]");
        viewport.scrollTo({ left: targets[next]?.offsetLeft || 0, behavior: "smooth" });
        return next;
      });
    }, AUTO_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [carouselVisible, direction, documentVisible, paused, reducedMotion, visibleCards.length]);

  function pause(resume = true) {
    setPaused(true);
    if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
    if (resume) {
      pauseTimer.current = window.setTimeout(() => setPaused(false), RESUME_AFTER_MS);
    }
  }
  function resumeAfterInteraction() {
    pause();
  }
  function pauseForPointerInteraction() {
    pause(false);
  }
  function finishPointerInteraction() {
    resumeAfterInteraction();
  }
  function pauseForWheelInteraction() {
    pause();
  }
  function move(delta: -1 | 1) {
    pause();
    const viewport = viewportRef.current;
    if (!viewport || !visibleCards.length) return;
    const next = (currentIndex + delta + visibleCards.length) % visibleCards.length;
    const targets = viewport.querySelectorAll<HTMLElement>("[data-carousel-card]");
    viewport.scrollTo({ left: targets[next]?.offsetLeft || 0, behavior: reducedMotion ? "auto" : "smooth" });
    setCurrentIndex(next);
  }

  useEffect(() => () => {
    if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
  }, []);

  if (!visibleCards.length) return null;
  return <div className="relative mt-4" aria-label={label || "Girlz Culture promotions"} role="region" data-auto-content-carousel data-section-id={sectionId || ""} data-carousel-direction={direction} data-current-index={currentIndex} data-auto-state={reducedMotion ? "reduced-motion" : paused ? "paused" : documentVisible && carouselVisible && visibleCards.length > 1 ? "running" : "idle"}>
    <div className="mb-2 hidden justify-end gap-2 md:flex">
      <button type="button" onClick={() => move(-1)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-plum/15 bg-white text-plum" aria-label="Previous cards"><ChevronLeft size={18}/></button>
      <button type="button" onClick={() => move(1)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-plum/15 bg-white text-plum" aria-label="Next cards"><ChevronRight size={18}/></button>
    </div>
    <div ref={viewportRef} tabIndex={0} onPointerDown={pauseForPointerInteraction} onPointerUp={finishPointerInteraction} onPointerCancel={finishPointerInteraction} onWheel={pauseForWheelInteraction} onFocusCapture={() => pause()} onBlurCapture={resumeAfterInteraction} onMouseEnter={() => pause()} onMouseLeave={resumeAfterInteraction} onScroll={() => { if (scrollTimer.current) window.clearTimeout(scrollTimer.current); scrollTimer.current = window.setTimeout(() => { const viewport = viewportRef.current; if (!viewport) return; const targets = Array.from(viewport.querySelectorAll<HTMLElement>("[data-carousel-card]")); const closest = targets.reduce((best, card, index) => { const distance = Math.abs(card.offsetLeft - viewport.scrollLeft); return distance < best.distance ? { index, distance } : best; }, { index: 0, distance: Number.POSITIVE_INFINITY }); setCurrentIndex(closest.index); }, 120); }} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {visibleCards.map((card) => <div data-carousel-card key={card.id || `${card.href}-${card.media_url}`} className="w-[72vw] max-w-[340px] shrink-0 snap-start"><PublicContentCard card={card}/></div>)}
    </div>
  </div>;
}
