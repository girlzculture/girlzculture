"use client";

import Link from "next/link";
import { CalendarDays, MapPin, ShieldCheck, Star } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";
import type { PublicSalonResult } from "@/lib/discoveryServer";
import { formatDistanceMiles } from "@/lib/location";

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
  mobileDistanceOnly?: boolean;
  surface?: "default" | "homepage";
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
  mobileDistanceOnly = false,
  surface = "default",
}: Props) {
  const verified = String(salon.verification_status || "")
    .toLowerCase()
    .startsWith("verified");
  const isList = variant === "list";
  const isCompact = variant === "compact";
  const area = [
    salon.borough || salon.address_city,
    salon.address_state,
  ]
    .filter(Boolean)
    .join(", ");
  const distanceLabel = formatDistanceMiles(salon.distance_miles) ||
    "Distance unavailable";
  const distanceOnlyOnMobile =
    mobileDistanceOnly || surface === "homepage";
  const locationLabel = [area || "Location available on profile", distanceLabel]
    .filter(Boolean)
    .join(" — ");
  const profileHref = `/salon/${salon.slug}`;
  const bookingQuery = new URLSearchParams();
  if (salon.matched_service?.id)
    bookingQuery.set("style", salon.matched_service.id);
  const bookHref = `/salon/${salon.slug}/book${
    bookingQuery.size ? `?${bookingQuery}` : ""
  }`;
  const currentPrice = salon.matched_service
    ? salon.matched_service.price
    : salon.starting_price;
  const originalPrice = salon.matched_service?.original_price ?? null;

  return (
    <article
      data-salon-card
      data-card-variant={variant}
      id={`salon-result-${salon.id}`}
      onMouseEnter={() => onFocus?.(salon.id)}
      onFocus={() => onFocus?.(salon.id)}
      className={`relative overflow-hidden rounded-[14px] border bg-white shadow-[0_5px_20px_rgba(13,17,20,.06)] transition ${
        selected
          ? "border-magenta ring-2 ring-magenta/20"
          : "border-plum/10"
      } ${
        isList
          ? "grid min-w-0 grid-cols-[118px_1fr] sm:grid-cols-[220px_1fr]"
          : isCompact
            ? "w-[calc((100vw-44px)/2)] min-w-[154px] max-w-[210px] shrink-0 snap-start sm:w-[230px] sm:max-w-[230px] lg:w-[260px] lg:max-w-[260px]"
            : "min-w-[76vw] snap-start sm:min-w-0"
      }`}
    >
      <Link
        data-salon-navigation
        href={profileHref}
        onClick={onNavigate}
        aria-label={`View ${salon.name}`}
        className={`relative block overflow-hidden bg-blush ${
          isList
            ? "min-h-[168px]"
            : isCompact
              ? "aspect-[16/9]"
              : "aspect-[16/10]"
        }`}
      >
        <SafeImage
          src={salon.cover_photo_url}
          fallbackSrc="/images/salon-warm.jpg"
          alt={`${salon.name} salon`}
          rendition="thumbnail"
          className="h-full w-full object-cover transition duration-500 hover:scale-[1.02]"
        />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-plum/95 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-white">
              <ShieldCheck aria-hidden="true" size={11} />
              Verified
            </span>
          ) : null}
          {salon.sponsored ? (
            <span className="rounded-full bg-white/95 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-plum">
              Sponsored
            </span>
          ) : null}
        </div>
      </Link>

      <div
        className={`min-w-0 ${
          isList
            ? "grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:p-4"
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
              isCompact ? "text-[14px] sm:text-base" : "text-lg sm:text-xl"
            }`}
          >
            {salon.name}
          </Link>

          <p
            className={`mt-1 flex min-w-0 items-center gap-1 text-ink/65 ${
              isCompact ? "text-[10px]" : "text-[11px]"
            }`}
          >
            <MapPin aria-hidden="true" size={isCompact ? 11 : 12} className="shrink-0" />
            <span
              data-no-translate="true"
              title={locationLabel}
              className={`min-w-0 truncate whitespace-nowrap ${
                distanceOnlyOnMobile ? "hidden sm:block" : "block"
              }`}
            >
              {locationLabel}
            </span>
            {distanceOnlyOnMobile ? (
              <span
                data-no-translate="true"
                title={distanceLabel}
                className="block min-w-0 truncate whitespace-nowrap sm:hidden"
              >
                {distanceLabel}
              </span>
            ) : null}
          </p>

          <div
            className={`${isCompact ? "mt-1.5" : "mt-2"} flex flex-wrap items-center gap-2 text-[11px]`}
          >
            {salon.review_count > 0 && salon.rating_overall > 0 ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <Star aria-hidden="true" size={13} className="fill-amber text-amber" />
                <b>{Number(salon.rating_overall).toFixed(1)}</b>
                <span className="text-ink/55">({salon.review_count})</span>
              </span>
            ) : null}
            {currentPrice !== null ? (
              <span className="whitespace-nowrap">
                From{" "}
                <b className="font-serif text-base">{money(currentPrice)}</b>
              </span>
            ) : (
              <span className="text-ink/55">View pricing</span>
            )}
            {originalPrice !== null ? (
              <span className="text-[10px] text-ink/45 line-through">
                {money(originalPrice)}
              </span>
            ) : null}
          </div>

          {salon.matched_service ? (
            <p
              data-no-translate="true"
              className="mt-2 line-clamp-1 text-[10px] font-semibold text-plum"
            >
              {salon.matched_service.name}
            </p>
          ) : isList && salon.services.length ? (
            <p
              data-no-translate="true"
              className="mt-2 line-clamp-1 text-[10px] text-ink/55"
            >
              {salon.services.map((service) => service.name).join(" · ")}
            </p>
          ) : null}

          {salon.promotion ? (
            <p className="mt-1 line-clamp-1 text-[10px] font-bold text-magenta">
              {salon.promotion.label || salon.promotion.title}
            </p>
          ) : null}

          {isList && salon.next_slot ? (
            <p className="mt-1 text-[10px] font-semibold gc-text-success">
              Opening {salon.next_slot.date} at {salon.next_slot.label}
            </p>
          ) : null}

        </div>

        <div
          className={`flex items-end gap-2 ${
            isList ? "sm:flex-col sm:justify-end" : "mt-3"
          } ${isCompact ? "hidden sm:flex" : ""}`}
        >
          <Link
            data-salon-navigation
            href={profileHref}
            onClick={onNavigate}
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-[8px] border border-magenta px-4 text-[11px] font-bold text-magenta"
          >
            View
          </Link>
          <Link
            data-salon-navigation
            href={bookHref}
            onClick={onNavigate}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-[8px] bg-magenta px-4 text-[11px] font-bold text-white"
          >
            <CalendarDays aria-hidden="true" size={13} />
            Book
          </Link>
        </div>
      </div>
    </article>
  );
}
