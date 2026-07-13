"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import ImageUpload from "@/components/ImageUpload";
import { BadgeCheck, Star } from "lucide-react";

type BookingRecord = {
  id?: string;
  salon_id?: string | null;
  customer_id?: string | null;
  status?: string | null;
  appointment_datetime?: string | null;
};

type SalonRecord = {
  id?: string;
  name?: string | null;
  neighborhood?: string | null;
};

type ReviewPayload = {
  booking_id?: string | null;
  salon_id?: string | null;
  customer_id?: string | null;
  rating_overall?: number | null;
  rating_price_accuracy?: number | null;
  rating_punctuality?: number | null;
  rating_quality?: number | null;
  rating_cleanliness?: number | null;
  would_return?: boolean | null;
  written_review?: string | null;
  result_photos?: string[] | null;
};

const starOptions = [1, 2, 3, 4, 5];

function renderStars(value: number) {
  return Array.from({ length: 5 }, (_, index) => (
    <Star key={index} size={20} className={index < value ? "fill-amber text-amber" : "text-ink/25"} aria-hidden="true" />
  ));
}

export default function ReviewForm({ booking, salon }: { booking: BookingRecord; salon: SalonRecord }) {
  const [overallRating, setOverallRating] = useState(5);
  const [priceAccuracy, setPriceAccuracy] = useState(5);
  const [punctuality, setPunctuality] = useState(5);
  const [quality, setQuality] = useState(5);
  const [cleanliness, setCleanliness] = useState(5);
  const [wouldReturn, setWouldReturn] = useState(true);
  const [comments, setComments] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCompleted = booking.status?.toLowerCase() === "completed";
  const bookingDate = booking.appointment_datetime ? new Date(booking.appointment_datetime).toLocaleString() : "Upcoming appointment";

  const canSubmit = useMemo(
    () => isCompleted && comments.trim().length >= 10,
    [isCompleted, comments],
  );

  const submitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isCompleted) {
      setError("This review can only be submitted after the booking is completed.");
      return;
    }

    if (!comments.trim()) {
      setError("Please add a short review before submitting.");
      return;
    }

    setSaving(true);

    const payload: ReviewPayload = {
      booking_id: booking.id ?? null,
      salon_id: salon.id ?? null,
      customer_id: booking.customer_id ?? null,
      rating_overall: overallRating,
      rating_price_accuracy: priceAccuracy,
      rating_punctuality: punctuality,
      rating_quality: quality,
      rating_cleanliness: cleanliness,
      would_return: wouldReturn,
      written_review: comments.trim(),
      result_photos: photoUrls.length ? photoUrls : null,
    };

    const { error: insertError } = await supabase
      .from("reviews")
      .insert(payload)
      .select()
      .maybeSingle();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSubmitted(true);
  };

  if (!booking || !salon) {
    return <div className="rounded-[24px] border border-plum/10 bg-white/80 p-6 text-center text-sm text-ink/70">Booking or salon not found.</div>;
  }

  if (submitted) {
    return (
      <div className="rounded-[32px] border border-plum/10 bg-blush/50 p-8 text-center shadow-sm">
        <BadgeCheck size={48} className="mx-auto text-amber" aria-hidden="true" />
        <h2 className="mt-4 font-serif text-3xl font-semibold text-plum">Thanks for your review</h2>
        <p className="mt-3 text-sm leading-7 text-ink/80">Your feedback helps the Girlz Culture community find the best salons and styles.</p>
        <a href={`/salon/${salon.id}`} className="mt-6 inline-flex rounded-full bg-magenta px-6 py-3 text-sm font-semibold text-white">See salon reviews</a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-plum/10 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Write a review</div>
            <h1 className="mt-2 font-serif text-4xl font-semibold text-plum">{salon.name}</h1>
            <p className="mt-2 text-sm text-ink/70">Booking ID: {booking.id}</p>
          </div>
          <div className="rounded-full bg-blush/60 px-4 py-2 text-sm font-semibold text-plum">{bookingDate}</div>
        </div>
      </div>

      {!isCompleted ? (
        <div className="rounded-[24px] border border-amber/20 bg-amber/10 p-6 text-sm text-ink/80">
          <p className="font-semibold text-plum">This booking must be completed before leaving a review.</p>
          <p className="mt-2">Your salon marks the appointment complete. Your verified review form will unlock automatically after that.</p>
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        </div>
      ) : null}

      <form onSubmit={submitReview} className="rounded-[32px] border border-plum/10 bg-blush/30 p-6 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-[24px] border border-plum/10 bg-white p-5">
              <div className="font-semibold text-plum">Overall rating</div>
              <div className="mt-4 flex gap-2">
                {starOptions.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOverallRating(value)}
                    className={`rounded-full border px-4 py-2 text-lg ${overallRating === value ? "border-magenta bg-magenta/10 text-plum" : "border-ink/10 bg-white text-ink/80"}`}
                  >
                    {renderStars(value)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Price accuracy", value: priceAccuracy, setter: setPriceAccuracy },
                { label: "Punctuality", value: punctuality, setter: setPunctuality },
                { label: "Quality", value: quality, setter: setQuality },
                { label: "Cleanliness", value: cleanliness, setter: setCleanliness },
              ].map((item) => (
                <div key={item.label} className="rounded-[24px] border border-plum/10 bg-white p-5">
                  <div className="font-semibold text-plum">{item.label}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {starOptions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => item.setter(value)}
                        className={`rounded-full border px-3 py-2 text-sm ${item.value === value ? "border-magenta bg-magenta/10 text-plum" : "border-ink/10 bg-cream text-ink/80"}`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[24px] border border-plum/10 bg-white p-5">
              <div className="font-semibold text-plum">Would you return?</div>
              <div className="mt-4 flex flex-wrap gap-3">
                {[
                  { label: "Yes", value: true },
                  { label: "No", value: false },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setWouldReturn(option.value)}
                    className={`rounded-full border px-4 py-2 text-sm ${wouldReturn === option.value ? "border-magenta bg-magenta/10 text-plum" : "border-ink/10 bg-cream text-ink/80"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block rounded-[24px] border border-plum/10 bg-white p-5">
              <span className="font-semibold text-plum">Write your review</span>
              <textarea
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                rows={6}
                placeholder="Share what made this experience great, or where there’s room to improve."
                className="mt-3 w-full rounded-3xl border border-ink/10 bg-cream/50 px-4 py-3 text-sm text-ink/90 outline-none transition focus:border-magenta focus:ring-2 focus:ring-magenta/10"
              />
            </label>

            <div className="rounded-[24px] border border-plum/10 bg-white p-5">
              <ImageUpload
                bucket="review-photos"
                multiple
                maxFiles={6}
                folder="reviews"
                label="Result photos"
                helperText="Upload before-and-after or final look photos. JPG and PNG only."
                value={photoUrls}
                onChange={(value) => setPhotoUrls(Array.isArray(value) ? value : value ? [value] : [])}
              />
            </div>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-ink/70">
            {isCompleted
              ? "Your review is ready to submit." 
              : "Complete the booking first, then submit your review."}
          </div>
          <button
            type="submit"
            disabled={!canSubmit || saving}
            className="rounded-full bg-magenta px-6 py-3 text-sm font-semibold text-white transition hover:bg-magenta/90 disabled:cursor-not-allowed disabled:bg-magenta/50"
          >
            {saving ? "Submitting…" : "Submit review"}
          </button>
        </div>
      </form>
    </div>
  );
}
