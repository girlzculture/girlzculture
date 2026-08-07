"use client";

import Link from "next/link";
import SafeImage from "@/components/site/SafeImage";
import type { PublicSalonResult } from "@/lib/discoveryServer";

type ExtendedSalon = PublicSalonResult & {
  matched_service?: {
    id: string;
    name: string;
    price: number | null;
    original_price: number | null;
  } | null;
  promotion?: {
    id: string;
    title: string;
    label: string | null;
  } | null;
  next_slot?: {
    date: string;
    value: string;
    label: string;
    stylist_name: string | null;
  } | null;
  reliability?: {
    completed_appointments: number;
    cancellation_rate_percent: number;
    label: string;
  };
  sponsored?: boolean;
};

type Props = {
  salon: ExtendedSalon;
  variant?: "grid" | "list" | "compact";
  selected?: boolean;
  onFocus?: (salonId: string) => void;
  onNavigate?: () => void;
};

function money(value: number | null | undefined) {
  return value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
    ? ""
    : `$${Number(value).toFixed(
        Number(value) % 1 === 0 ? 0 : 2,
      )}`;
}

export default function MarketplaceSalonCard({
  salon,
  variant = "grid",
  selected = false,
  onFocus,
  onNavigate,
}: Props) {
  const verified = String(
    salon.verification_status || "",
  )
    .toLowerCase()
    .startsWith("verified");
  const area = [
    salon.borough || salon.address_city,
    salon.address_state,
  ]
    .filter(Boolean)
    .join(", ");
  const distance = Number.isFinite(salon.distance_miles)
    ? `${
        salon.distance_miles < 0.1
          ? "Under 0.1"
          : salon.distance_miles.toFixed(1)
      } miles away`
    : "";
  const profileHref = `/salon/${salon.slug}`;
  const bookingQuery = new URLSearchParams();
  if (salon.matched_service?.id)
    bookingQuery.set("style", salon.matched_service.id);
  else if (salon.services[0]?.id)
    bookingQuery.set("style", salon.services[0].id);
  const bookHref = `/salon/${salon.slug}/book${
    bookingQuery.size ? `?${bookingQuery}` : ""
  }`;
  const isList = variant === "list";
  const isCompact = variant === "compact";
  const currentPrice =
    salon.matched_service?.price ?? salon.starting_price;
  const originalPrice =
    salon.matched_service?.original_price ?? null;

  return (
    <article
      data-salon-card
      data-card-variant={variant}
      id={`salon-result-${salon.id}`}
      onMouseEnter={() => onFocus?.(salon.id)}
      onFocus={() => onFocus?.(salon.id)}
      className={`relative overflow-hidden rounded-[12px] border bg-white shadow-[0_5px_18px_rgba(13,17,20,.06)] ${
        selected
          ? "border-magenta ring-2 ring-magenta/20"
          : "border-plum/10"
      } ${
        isList
          ? "grid min-w-0 grid-cols-[104px_1fr] sm:grid-cols-[150px_1fr]"
          : isCompact
            ? "w-[calc((100vw-40px)/2)] min-w-[150px] max-w-[205px] shrink-0 snap-start sm:w-[220px] sm:max-w-[220px]"
            : "min-w-[72vw] snap-start sm:min-w-0"
      }`}
    >
      <Link
        data-salon-navigation
        href={profileHref}
        onClick={onNavigate}
        aria-label={`View ${salon.name}`}
        className={`relative block overflow-hidden bg-blush ${
          isList
            ? "min-h-[132px]"
            : isCompact
              ? "aspect-[4/3]"
              : "aspect-[16/10]"
        }`}
      >
        <SafeImage
          src={salon.cover_photo_url}
          fallbackSrc="/images/salon-warm.jpg"
          alt={`${salon.name} salon`}
          rendition="thumbnail"
          className="h-full w-full object-cover"
        />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {verified ? (
            <span className="rounded-full bg-charcoal/92 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-white">
              Verified
            </span>
          ) : null}
          {salon.sponsored ? (
            <span className="rounded-full bg-white/95 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-plum">
              Sponsored
            </span>
          ) : null}
        </div>
      </Link>

      <div
        className={`min-w-0 ${
          isList
            ? "flex flex-col justify-between p-3"
            : isCompact
              ? "p-2.5"
              : "p-3"
        }`}
      >
        <div className="min-w-0">
          <Link
            data-salon-navigation
            data-no-translate="true"
            href={profileHref}
            onClick={onNavigate}
            className={`block truncate font-serif font-semibold text-ink hover:text-magenta ${
              isCompact ? "text-[14px]" : "text-[17px]"
            }`}
          >
            {salon.name}
          </Link>

          <p
            data-no-translate="true"
            className="mt-1 truncate text-[10px] font-medium text-ink/70"
            title={[area, distance].filter(Boolean).join(" · ")}
          >
            {[area || "Location on profile", distance]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <p className="mt-1.5 text-[10px] font-semibold text-ink">
            {salon.review_count > 0 &&
            salon.rating_overall > 0
              ? `${Number(salon.rating_overall).toFixed(
                  1,
                )} from ${salon.review_count} ${
                  salon.review_count === 1
                    ? "review"
                    : "reviews"
                }`
              : "New on Girlz Culture"}
          </p>

          {salon.matched_service ? (
            <p
              data-no-translate="true"
              className="mt-1.5 line-clamp-1 text-[10px] font-semibold text-plum"
            >
              {salon.matched_service.name}
            </p>
          ) : null}

          <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
            {currentPrice !== null ? (
              <span className="text-[10px] text-ink/70">
                From{" "}
                <b className="font-serif text-[15px] text-ink">
                  {money(currentPrice)}
                </b>
              </span>
            ) : (
              <span className="text-[10px] text-ink/60">
                View pricing
              </span>
            )}
            {originalPrice !== null ? (
              <span className="text-[9px] text-ink/45 line-through">
                {money(originalPrice)}
              </span>
            ) : null}
          </div>

          {salon.promotion ? (
            <p className="mt-1 line-clamp-1 text-[9px] font-bold text-magenta">
              {salon.promotion.label ||
                salon.promotion.title}
            </p>
          ) : null}

          {isList && salon.next_slot ? (
            <p className="mt-1 text-[9px] font-semibold text-green-800">
              Opening {salon.next_slot.date} at{" "}
              {salon.next_slot.label}
            </p>
          ) : null}

          {isList && salon.reliability ? (
            <p className="mt-1 text-[9px] font-medium text-ink/55">
              {salon.reliability.label}
              {salon.reliability.completed_appointments
                ? ` · ${salon.reliability.completed_appointments} completed`
                : ""}
            </p>
          ) : null}
        </div>

        <div
          className={`mt-2 grid grid-cols-2 gap-2 ${
            isCompact ? "hidden sm:grid" : ""
          }`}
        >
          <Link
            data-salon-navigation
            href={profileHref}
            onClick={onNavigate}
            className="inline-flex min-h-9 items-center justify-center rounded-[7px] border border-magenta px-2 text-[10px] font-bold text-magenta"
          >
            View
          </Link>
          <Link
            data-salon-navigation
            href={bookHref}
            onClick={onNavigate}
            className="inline-flex min-h-9 items-center justify-center rounded-[7px] bg-magenta px-2 text-[10px] font-bold text-white"
          >
            Book
          </Link>
        </div>
      </div>
    </article>
  );
}
