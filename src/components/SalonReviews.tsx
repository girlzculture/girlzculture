"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Star, UserRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { salonSupabase as supabase } from "@/lib/supabase";
import SafeImage from "@/components/site/SafeImage";

type ReviewRecord = {
  id?: string;
  rating_overall?: number | null;
  rating_price_accuracy?: number | null;
  rating_punctuality?: number | null;
  rating_quality?: number | null;
  rating_cleanliness?: number | null;
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
};

function renderStars(value: number) {
  return Array.from({ length: 5 }, (_, index) => (
    <Star key={index} size={13} className={index < Math.round(value) ? "fill-amber text-amber" : "fill-transparent text-ink/20"} />
  ));
}

export default function SalonReviews({ reviews, salonRating, salonReviewCount }: Props) {
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
      priceAccuracy: average("rating_price_accuracy"),
      punctuality: average("rating_punctuality"),
      cleanliness: average("rating_cleanliness"),
    };
  }, [localReviews, salonRating]);

  const reviewBreakdown = [
    { label: "Overall Experience", value: averages.overall },
    { label: "Quality of Style", value: averages.quality },
    { label: "Price Accuracy", value: averages.priceAccuracy },
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
    const { data: saved, error } = await supabase.rpc("reply_to_review", { target_review_id: reviewId, reply_text: replyText.trim() });
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
    <section id="reviews" className="rounded-[15px] border border-plum/10 bg-white/75 p-4 shadow-[0_5px_18px_rgba(26,18,32,0.05)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-[24px] font-semibold text-ink">Reviews</h2>
          {salonReviewCount > 0 && salonRating > 0 ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold"><Star size={14} className="fill-amber text-amber" />{salonRating.toFixed(1)}</span> : <span className="text-[12px] font-semibold">New</span>}
          <span className="text-[10px] text-ink/50">({salonReviewCount})</span>
        </div>
        {localReviews.length > 1 ? <div className="flex items-center gap-2"><button type="button" onClick={showPrevious} aria-label="Previous review" className="grid h-8 w-8 place-items-center rounded-full border border-plum/10 text-plum"><ChevronLeft size={15} /></button><button type="button" onClick={showNext} aria-label="Next review" className="grid h-8 w-8 place-items-center rounded-full border border-plum/10 text-plum"><ChevronRight size={15} /></button></div> : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="space-y-2.5 rounded-[12px] bg-blush/25 p-4">
          {reviewBreakdown.map((item) => (
            <div key={item.label} className="grid grid-cols-[112px_1fr_28px] items-center gap-2 text-[10px] text-ink/65">
              <span>{item.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-magenta" style={{ width: `${Math.min(100, (item.value / 5) * 100)}%` }} /></span>
              <span className="text-right font-semibold text-ink">{item.value.toFixed(1)}</span>
            </div>
          ))}
        </div>

        {activeReview ? (
          <article className="rounded-[12px] border border-plum/10 bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blush text-plum/60"><UserRound size={20} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><span className="rounded-full bg-plum px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-white">Verified</span><h3 className="mt-1.5 text-[11px] font-semibold">{activeReview.customer?.name || "Verified Client"}</h3></div>
                  <time className="text-[9px] text-ink/45">{activeReview.created_at ? new Date(activeReview.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Recent"}</time>
                </div>
                <div className="mt-1 flex gap-0.5">{renderStars(activeReview.rating_overall ?? salonRating)}</div>
              </div>
            </div>
            <p className="mt-3 line-clamp-3 text-[11px] leading-[1.55] text-ink/75">{activeReview.written_review || "This verified client rated their completed appointment."}</p>
            {activeReview.result_photos?.length ? <div className="mt-3 flex gap-1.5">{activeReview.result_photos.slice(0, 4).map((photo, index) => <div key={`${photo}-${index}`} className="relative h-11 w-14 overflow-hidden rounded-[6px] bg-blush"><SafeImage src={photo} fallbackSrc={photo} alt={`Review result ${index + 1}`} className="h-full w-full object-cover" /></div>)}</div> : null}
            {activeReview.salon_reply ? <div className="mt-3 rounded-[8px] bg-blush/25 p-3 text-[10px] leading-4 text-ink/70"><strong className="text-plum">Salon reply:</strong> {activeReview.salon_reply}</div> : canReply ? <div className="mt-3">{activeReply === activeReview.id ? <><textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} rows={2} placeholder="Write a reply" className="w-full rounded-[8px] border border-plum/10 px-3 py-2 text-[10px] outline-none" /><div className="mt-2 flex gap-2"><button type="button" onClick={() => submitReply(activeReview.id || "")} disabled={replySaving} className="rounded-full bg-magenta px-3 py-1.5 text-[9px] font-semibold text-white">{replySaving ? "Saving…" : "Save reply"}</button><button type="button" onClick={() => { setActiveReply(null); setReplyText(""); }} className="rounded-full border border-magenta px-3 py-1.5 text-[9px] text-magenta">Cancel</button></div>{replyError ? <p className="mt-2 text-[9px] text-red-700">{replyError}</p> : null}</> : <button type="button" onClick={() => setActiveReply(activeReview.id || null)} className="rounded-full bg-magenta px-3 py-1.5 text-[9px] font-semibold text-white">Reply as salon</button>}</div> : null}
          </article>
        ) : <p className="grid min-h-28 place-items-center rounded-[12px] border border-dashed border-plum/15 text-[11px] text-ink/55">No reviews yet. Reviews from completed bookings will appear here automatically.</p>}
      </div>

      {localReviews.length > 1 ? <div className="mt-3 flex justify-center gap-1.5">{localReviews.map((review, index) => <button key={review.id || index} type="button" onClick={() => setActiveIndex(index)} aria-label={`Show review ${index + 1}`} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-5 bg-magenta" : "w-1.5 bg-ink/20"}`} />)}</div> : null}
    </section>
  );
}
