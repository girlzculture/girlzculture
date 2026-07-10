"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SafeImage from "@/components/site/SafeImage";

type ReviewRecord = {
  id?: string;
  rating_overall?: number | null;
  rating_price_accuracy?: number | null;
  rating_punctuality?: number | null;
  rating_quality?: number | null;
  rating_cleanliness?: number | null;
  would_return?: boolean | null;
  written_review?: string | null;
  result_photos?: string[] | null;
  salon_reply?: string | null;
  created_at?: string | null;
  customer?: { name?: string | null } | null;
};

type Props = {
  reviews: ReviewRecord[];
  salonRating: number;
  salonReviewCount: number;
  fallbackPhotos: string[];
};

function renderStars(value: number) {
  return Array.from({ length: 5 }, (_, index) => (
    <Star key={index} size={12} className={index < Math.round(value) ? "fill-amber text-amber" : "fill-transparent text-ink/20"} />
  ));
}

export default function SalonReviews({ reviews, salonRating, salonReviewCount, fallbackPhotos }: Props) {
  const searchParams = useSearchParams();
  const canReply = searchParams.get("reply") === "1";
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeReply, setActiveReply] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [localReviews, setLocalReviews] = useState(reviews);

  const averages = useMemo(() => {
    const average = (key: keyof ReviewRecord, fallback = salonRating) => {
      const values = localReviews.map((review) => review[key]).filter((value): value is number => typeof value === "number");
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
    };

    return {
      overall: average("rating_overall"),
      quality: average("rating_quality"),
      professionalism: average("rating_price_accuracy"),
      punctuality: average("rating_punctuality"),
      cleanliness: average("rating_cleanliness"),
    };
  }, [localReviews, salonRating]);

  const reviewBreakdown = [
    { label: "Overall Experience", value: averages.overall },
    { label: "Quality of Style", value: averages.quality },
    { label: "Professionalism", value: averages.professionalism },
    { label: "Time Management", value: averages.punctuality },
    { label: "Cleanliness", value: averages.cleanliness },
  ];

  const activeReview = localReviews[activeIndex] || null;

  const submitReply = async (reviewId: string) => {
    if (!replyText.trim()) {
      setReplyError("Please type a reply before saving.");
      return;
    }

    setReplySaving(true);
    setReplyError(null);
    const { data: saved, error } = await supabase.rpc("reply_to_review", {
      target_review_id: reviewId,
      reply_text: replyText.trim(),
    });

    if (error || !saved) {
      setReplyError(error?.message || "That reply could not be saved. Please make sure you are signed in to the correct salon.");
      setReplySaving(false);
      return;
    }

    setLocalReviews((current) => current.map((review) => review.id === reviewId ? { ...review, salon_reply: replyText.trim() } : review));
    setActiveReply(null);
    setReplyText("");
    setReplySaving(false);
  };

  const showPrevious = () => setActiveIndex((current) => current === 0 ? Math.max(0, localReviews.length - 1) : current - 1);
  const showNext = () => setActiveIndex((current) => localReviews.length ? (current + 1) % localReviews.length : 0);

  return (
    <section className="h-full min-w-0 rounded-[12px] border border-plum/10 bg-white/80 p-4 shadow-[0_5px_18px_rgba(26,18,32,0.05)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-[22px] font-semibold text-ink">Reviews</h2>
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink"><Star size={14} className="fill-amber text-amber" />{salonRating.toFixed(1)}</span>
          <span className="text-[9px] text-ink/50">({salonReviewCount} reviews)</span>
        </div>
        <a href="#reviews" className="text-[9px] font-semibold text-magenta">View all</a>
      </div>

      <div className="mt-4 space-y-3">
        {reviewBreakdown.map((item) => (
          <div key={item.label} className="grid grid-cols-[92px_1fr_24px] items-center gap-2 text-[9px] text-ink/65">
            <span>{item.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-blush/60"><span className="block h-full rounded-full bg-magenta" style={{ width: `${Math.min(100, (item.value / 5) * 100)}%` }} /></span>
            <span className="text-right font-semibold text-ink">{item.value.toFixed(1)}</span>
          </div>
        ))}
      </div>

      <div id="reviews" className="mt-5">
        {activeReview ? (
          <article className="rounded-[10px] border border-plum/10 bg-blush/35 p-4">
            <div className="flex items-start gap-3">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white">
                <SafeImage src={activeReview.result_photos?.[0]} fallbackSrc={fallbackPhotos[activeIndex % fallbackPhotos.length]} alt="Verified client" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="rounded-full bg-plum px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-white">Verified</span>
                    <h3 className="mt-1 text-[10px] font-semibold text-ink">{activeReview.customer?.name || "Verified Client"}</h3>
                  </div>
                  <time className="text-[8px] text-ink/45">{activeReview.created_at ? new Date(activeReview.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Recent"}</time>
                </div>
                <div className="mt-2 flex gap-0.5">{renderStars(activeReview.rating_overall ?? salonRating)}</div>
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-[1.55] text-ink/75">{activeReview.written_review || "This verified client rated their completed appointment."}</p>

            {activeReview.result_photos?.length ? (
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {activeReview.result_photos.slice(0, 4).map((photo, index) => (
                  <div key={`${photo}-${index}`} className="relative h-12 overflow-hidden rounded-[6px] bg-white">
                    <SafeImage src={photo} fallbackSrc={fallbackPhotos[index % fallbackPhotos.length]} alt={`Review result ${index + 1}`} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null}

            {activeReview.salon_reply ? (
              <div className="mt-3 rounded-[8px] bg-white/80 p-3 text-[10px] leading-4 text-ink/70"><strong className="text-plum">Salon reply:</strong> {activeReview.salon_reply}</div>
            ) : canReply ? (
              <div className="mt-3">
                {activeReply === activeReview.id ? (
                  <>
                    <textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} rows={3} placeholder="Write a reply" className="w-full rounded-[8px] border border-plum/10 bg-white px-3 py-2 text-[10px] outline-none" />
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => submitReply(activeReview.id || "")} disabled={replySaving} className="rounded-full bg-magenta px-3 py-1.5 text-[9px] font-semibold text-white">{replySaving ? "Saving…" : "Save reply"}</button>
                      <button type="button" onClick={() => { setActiveReply(null); setReplyText(""); }} className="rounded-full border border-magenta px-3 py-1.5 text-[9px] text-magenta">Cancel</button>
                    </div>
                    {replyError ? <p className="mt-2 text-[9px] text-red-700">{replyError}</p> : null}
                  </>
                ) : (
                  <button type="button" onClick={() => setActiveReply(activeReview.id || null)} className="rounded-full bg-magenta px-3 py-1.5 text-[9px] font-semibold text-white">Reply as salon</button>
                )}
              </div>
            ) : null}
          </article>
        ) : (
          <div className="rounded-[10px] border border-dashed border-plum/20 bg-blush/25 p-5 text-center">
            <div className="text-[10px] font-semibold text-plum">Verified review details are being added</div>
            <p className="mt-2 text-[9px] leading-4 text-ink/55">Reviews from completed bookings will appear here automatically.</p>
          </div>
        )}
      </div>

      {localReviews.length > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button type="button" onClick={showPrevious} aria-label="Previous review" className="text-plum"><ChevronLeft size={14} /></button>
          {localReviews.map((review, index) => <button key={review.id || index} type="button" onClick={() => setActiveIndex(index)} aria-label={`Show review ${index + 1}`} className={`h-1.5 w-1.5 rounded-full ${index === activeIndex ? "bg-magenta" : "bg-ink/20"}`} />)}
          <button type="button" onClick={showNext} aria-label="Next review" className="text-plum"><ChevronRight size={14} /></button>
        </div>
      ) : null}
    </section>
  );
}
