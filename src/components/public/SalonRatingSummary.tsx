"use client";

import { Star } from "lucide-react";

function RatingStar({ value, index }: { value: number; index: number }) {
  const fill = Math.max(0, Math.min(1, value - index));
  return (
    <span className="relative inline-flex h-4 w-4" aria-hidden="true">
      <Star size={16} className="absolute inset-0 fill-ink/10 text-ink/20" />
      {fill > 0 ? (
        <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
          <Star size={16} className="fill-amber text-amber" />
        </span>
      ) : null}
    </span>
  );
}

export default function SalonRatingSummary({
  rating,
  reviewCount,
}: {
  rating: number;
  reviewCount: number;
}) {
  const hasReviews = reviewCount > 0 && rating > 0;
  const safeRating = hasReviews ? Math.max(0, Math.min(5, rating)) : 0;

  function viewReviews() {
    const section = document.getElementById("reviews");
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => section.focus({ preventScroll: true }), 450);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
      <span
        role="img"
        className="flex gap-0.5"
        aria-label={hasReviews ? `${safeRating.toFixed(1)} out of 5 stars` : "No reviews yet"}
      >
        {Array.from({ length: 5 }, (_, index) => (
          <RatingStar key={index} value={safeRating} index={index} />
        ))}
      </span>
      {hasReviews ? (
        <strong className="tabular-nums text-ink">{safeRating.toFixed(1)}</strong>
      ) : (
        <span className="text-ink/50">No reviews yet</span>
      )}
      <button
        type="button"
        onClick={viewReviews}
        className="min-h-8 rounded-full px-1.5 text-[10px] font-bold text-magenta underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-magenta"
      >
        View reviews
      </button>
    </div>
  );
}
