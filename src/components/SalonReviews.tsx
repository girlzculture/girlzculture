"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ReviewRecord = {
  id?: string;
  overall_rating?: number | null;
  price_accuracy_rating?: number | null;
  punctuality_rating?: number | null;
  quality_rating?: number | null;
  cleanliness_rating?: number | null;
  would_return?: boolean | null;
  comments?: string | null;
  photos?: string[] | null;
  salon_reply?: string | null;
  created_at?: string | null;
};

type Props = {
  salonId: string;
  reviews: ReviewRecord[];
};

function renderStars(value: number) {
  return Array.from({ length: 5 }, (_, index) => (
    <span key={index} className={index < value ? "text-amber" : "text-ink/25"}>
      ★
    </span>
  ));
}

export default function SalonReviews({ salonId, reviews }: Props) {
  const searchParams = useSearchParams();
  const canReply = searchParams.get("reply") === "1";
  const [activeReply, setActiveReply] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>("");
  const [replySaving, setReplySaving] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [localReviews, setLocalReviews] = useState(reviews);

  const reviewCount = localReviews.length;
  const averages = useMemo(() => {
    if (!reviewCount) return null;

    const average = (key: keyof ReviewRecord) => {
      const values = localReviews
        .map((review) => review[key])
        .filter((value): value is number => typeof value === "number");
      if (!values.length) return 0;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    return {
      overall: average("overall_rating"),
      price_accuracy: average("price_accuracy_rating"),
      punctuality: average("punctuality_rating"),
      quality: average("quality_rating"),
      cleanliness: average("cleanliness_rating"),
    };
  }, [localReviews, reviewCount]);

  const submitReply = async (reviewId: string) => {
    if (!replyText.trim()) {
      setReplyError("Please type a reply before saving.");
      return;
    }

    setReplySaving(true);
    setReplyError(null);

    const { error } = await supabase
      .from("reviews")
      .update({ salon_reply: replyText.trim() })
      .eq("id", reviewId);

    if (error) {
      setReplyError(error.message);
      setReplySaving(false);
      return;
    }

    setLocalReviews((current) =>
      current.map((review) =>
        review.id === reviewId ? { ...review, salon_reply: replyText.trim() } : review,
      ),
    );
    setActiveReply(null);
    setReplyText("");
    setReplySaving(false);
  };

  if (reviewCount === 0) {
    return (
      <section className="rounded-[24px] border border-plum/10 bg-white/80 p-6 shadow-sm sm:p-8">
        <div className="text-center">
          <div className="text-lg font-semibold text-plum">Reviews</div>
          <p className="mt-3 text-sm text-ink/70">New to Girlz Culture — be the first to review this salon.</p>
          <p className="mt-2 text-sm text-ink/70">Once a completed booking is reviewed, this salon will earn a rating and community feedback.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[24px] border border-plum/10 bg-white/80 p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Reviews</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-plum">Community feedback</h2>
        </div>
        <div className="rounded-full bg-blush/60 px-4 py-2 text-sm font-semibold text-plum">{reviewCount} reviews</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Overall", value: averages?.overall ?? 0 },
          { label: "Price", value: averages?.price_accuracy ?? 0 },
          { label: "Punctuality", value: averages?.punctuality ?? 0 },
          { label: "Quality", value: averages?.quality ?? 0 },
        ].map((item) => (
          <div key={item.label} className="rounded-[24px] border border-plum/10 bg-blush/30 p-4 text-center">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-ink/60">{item.label}</div>
            <div className="mt-3 text-3xl font-semibold text-plum">{item.value.toFixed(1)}</div>
            <div className="mt-2 text-amber">{renderStars(Math.round(item.value))}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-6">
        {localReviews.map((review) => {
          const createdAt = review.created_at ? new Date(review.created_at).toLocaleDateString() : "Recent";
          return (
            <article key={review.id} className="rounded-[24px] border border-plum/10 bg-cream/60 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.25em] text-ink/60">{createdAt}</div>
                  <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-plum">
                    {renderStars(review.overall_rating ?? 0)}
                    <span>{(review.overall_rating ?? 0).toFixed(1)}</span>
                  </div>
                </div>
                <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-plum">{review.would_return ? "Would return" : "Would not return"}</div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Price accuracy", value: review.price_accuracy_rating },
                  { label: "Punctuality", value: review.punctuality_rating },
                  { label: "Quality", value: review.quality_rating },
                  { label: "Cleanliness", value: review.cleanliness_rating },
                ].map((item) => (
                  <div key={item.label} className="rounded-3xl border border-plum/10 bg-white p-4 text-sm">
                    <div className="font-semibold text-plum">{item.label}</div>
                    <div className="mt-2 text-amber">{renderStars(item.value ?? 0)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-4 text-sm text-ink/80">
                <p>{review.comments}</p>
                {review.photos?.length ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {review.photos.map((photo, index) => (
                      <div key={index} className="overflow-hidden rounded-3xl border border-ink/10 bg-white">
                        <div className="h-28 w-full bg-cream/70 p-4 text-center text-ink/60">{photo}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {review.salon_reply ? (
                <div className="mt-5 rounded-[24px] border border-plum/10 bg-white p-5 text-sm text-ink/80">
                  <div className="mb-2 font-semibold text-plum">Salon reply</div>
                  <p>{review.salon_reply}</p>
                </div>
              ) : canReply ? (
                <div className="mt-5 rounded-[24px] border border-magenta/20 bg-magenta/10 p-5">
                  {activeReply === review.id ? (
                    <>
                      <textarea
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        rows={4}
                        placeholder="Write a reply for this review"
                        className="w-full rounded-3xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/90 outline-none"
                      />
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => submitReply(review.id || "")}
                          disabled={replySaving}
                          className="rounded-full bg-magenta px-4 py-2 text-sm font-semibold text-white"
                        >
                          {replySaving ? "Saving…" : "Save reply"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveReply(null);
                            setReplyText("");
                          }}
                          className="rounded-full border border-magenta px-4 py-2 text-sm text-magenta"
                        >
                          Cancel
                        </button>
                      </div>
                      {replyError ? <p className="mt-2 text-sm text-red-700">{replyError}</p> : null}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveReply(review.id || null)}
                      className="rounded-full bg-magenta px-4 py-2 text-sm font-semibold text-white"
                    >
                      Reply as salon
                    </button>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
