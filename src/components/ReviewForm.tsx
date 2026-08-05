"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ShieldCheck, Star } from "lucide-react";
import { bookingReference } from "@/lib/bookingReference";
import { readApiResponse } from "@/lib/apiResponseClient";

type Row = Record<string, unknown>;
type ReviewState = "eligible" | "used" | "ineligible" | "invalid";
const starOptions = [1, 2, 3, 4, 5];

function Rating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-mist bg-white p-5">
      <legend className="px-1 font-semibold text-charcoal">{label}</legend>
      <div className="mt-2 flex gap-2" role="radiogroup" aria-label={label}>
        {starOptions.map((rating) => (
          <button
            key={rating}
            type="button"
            role="radio"
            aria-checked={value === rating}
            aria-label={`${rating} star${rating === 1 ? "" : "s"}`}
            onClick={() => onChange(rating)}
            className={`grid h-11 w-11 place-items-center rounded-full border ${value === rating ? "border-teal bg-teal text-white" : "border-mist bg-white text-charcoal"}`}
          >
            {rating}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function ReviewForm({
  token,
  state: initialState,
  message: initialMessage,
  booking,
  salon,
  existing,
}: {
  token: string;
  state: ReviewState;
  message?: string;
  booking?: Row;
  salon?: Row;
  existing?: Row;
}) {
  const [state, setState] = useState<ReviewState | "submitted">(initialState);
  const [overallRating, setOverallRating] = useState(5);
  const [priceAccuracy, setPriceAccuracy] = useState(5);
  const [punctuality, setPunctuality] = useState(5);
  const [quality, setQuality] = useState(5);
  const [cleanliness, setCleanliness] = useState(5);
  const [wouldReturn, setWouldReturn] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [reviewTitle, setReviewTitle] = useState("");
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = useMemo(
    () =>
      state === "eligible" &&
      displayName.trim().length >= 1 &&
      comments.trim().length >= 10 &&
      !saving,
    [comments, displayName, saving, state],
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          review_title: reviewTitle.trim(),
          rating_overall: overallRating,
          rating_price_accuracy: priceAccuracy,
          rating_punctuality: punctuality,
          rating_quality: quality,
          rating_cleanliness: cleanliness,
          would_return: wouldReturn,
          written_review: comments.trim(),
        }),
      });
      const body = await readApiResponse(response, "Your review could not be submitted.");
      if (!response.ok) throw new Error(body.error || "Your review could not be submitted.");
      setState("submitted");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Your review could not be submitted.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (state !== "eligible") {
    const submitted = state === "submitted";
    const alreadyUsed = state === "used";
    return (
      <section className="rounded-3xl border border-mist bg-subtle p-8 text-center shadow-sm">
        <BadgeCheck size={52} className="mx-auto text-teal" aria-hidden="true" />
        <h1 className="mt-4 font-serif text-4xl font-semibold text-charcoal">
          {submitted
            ? "Thanks for your review"
            : alreadyUsed
              ? "Review already submitted"
              : "Review link unavailable"}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-ink/70">
          {submitted
            ? "Your verified feedback is now part of the Girlz Culture community."
            : initialMessage || "This secure review link is invalid, expired, or no longer eligible."}
        </p>
        {alreadyUsed && existing ? (
          <div className="mx-auto mt-5 max-w-lg rounded-2xl border border-mist bg-white p-5 text-left">
            <div className="flex items-center gap-2 text-amber">
              {Array.from({ length: Number(existing.rating_overall || 0) }, (_, index) => (
                <Star key={index} size={17} fill="currentColor" />
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-ink/75">
              {String(existing.written_review || "")}
            </p>
          </div>
        ) : null}
        <Link
          href={salon?.slug ? `/salon/${salon.slug}` : "/salons"}
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-teal px-6 font-semibold text-white"
        >
          {salon?.slug ? "View salon" : "Find a salon"}
        </Link>
      </section>
    );
  }

  const bookingDate = booking?.appointment_datetime
    ? new Date(String(booking.appointment_datetime)).toLocaleString()
    : "";
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-mist bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-teal">
          <ShieldCheck size={17} /> Verified completed booking
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold text-charcoal">
          Review {String(salon?.name || "your salon")}
        </h1>
        <p className="mt-2 text-sm text-ink/65">
          Booking {bookingReference(booking || {})}
          {bookingDate ? ` · ${bookingDate}` : ""}
        </p>
      </header>
      <form onSubmit={submit} className="rounded-3xl border border-mist bg-subtle p-6">
        <label className="mb-4 block rounded-2xl border border-mist bg-white p-5">
          <span className="font-semibold text-charcoal">First name</span>
          <input
            required
            minLength={1}
            maxLength={40}
            autoComplete="given-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="For example, Janel"
            className="mt-3 min-h-11 w-full rounded-xl border border-mist bg-white px-4 outline-none focus:border-teal"
          />
          <span className="mt-1 block text-xs text-ink/55">
            Enter only your first name. Your booking identity and contact details stay private.
          </span>
        </label>
        <label className="mb-4 block rounded-2xl border border-mist bg-white p-5">
          <span className="font-semibold text-charcoal">Review title <span className="font-normal text-ink/50">(optional)</span></span>
          <input
            maxLength={100}
            value={reviewTitle}
            onChange={(event) => setReviewTitle(event.target.value)}
            placeholder="Summarize your visit"
            className="mt-3 min-h-11 w-full rounded-xl border border-mist bg-white px-4 outline-none focus:border-teal"
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <Rating label="Overall experience" value={overallRating} onChange={setOverallRating} />
          <Rating label="Price accuracy" value={priceAccuracy} onChange={setPriceAccuracy} />
          <Rating label="Punctuality" value={punctuality} onChange={setPunctuality} />
          <Rating label="Quality" value={quality} onChange={setQuality} />
          <Rating label="Cleanliness" value={cleanliness} onChange={setCleanliness} />
          <fieldset className="rounded-2xl border border-mist bg-white p-5">
            <legend className="px-1 font-semibold text-charcoal">Would you return?</legend>
            <div className="mt-2 flex gap-2">
              {[true, false].map((choice) => (
                <button
                  key={String(choice)}
                  type="button"
                  onClick={() => setWouldReturn(choice)}
                  className={`min-h-11 rounded-xl border px-5 font-semibold ${wouldReturn === choice ? "border-teal bg-teal text-white" : "border-mist bg-white"}`}
                >
                  {choice ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <label className="mt-4 block rounded-2xl border border-mist bg-white p-5">
          <span className="font-semibold text-charcoal">Your review</span>
          <textarea
            required
            minLength={10}
            maxLength={3000}
            rows={6}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            placeholder="Share what went well and what future customers should know."
            className="mt-3 w-full rounded-xl border border-mist bg-white px-4 py-3 outline-none focus:border-teal"
          />
          <span className="mt-1 block text-xs text-ink/55">
            {comments.length}/3000 · Your rating and words cannot be silently rewritten by an administrator.
          </span>
        </label>
        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <button
          disabled={!canSubmit}
          className="mt-5 min-h-12 w-full rounded-xl bg-teal px-6 font-bold text-white disabled:bg-mist disabled:text-ink/45"
        >
          {saving ? "Submitting…" : "Submit verified review"}
        </button>
      </form>
    </div>
  );
}
