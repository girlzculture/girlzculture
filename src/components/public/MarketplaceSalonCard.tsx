"use client";

import Link from "next/link";
import { CalendarDays, Heart, MapPin, ShieldCheck, Star } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import type { PublicSalonResult } from "@/lib/discoveryServer";

type Props = {
  salon: PublicSalonResult;
  variant?: "grid" | "list" | "compact";
  selected?: boolean;
  onFocus?: (salonId: string) => void;
};

export default function MarketplaceSalonCard({ salon, variant = "grid", selected = false, onFocus }: Props) {
  const customerLocation = useCustomerLocation();
  const verified = String(salon.verification_status || "").toLowerCase().startsWith("verified");
  const area = [salon.borough || salon.address_city, salon.address_state].filter(Boolean).join(", ");
  const isList = variant === "list";
  const context = new URLSearchParams();
  if (customerLocation.location) {
    context.set("location", customerLocation.location.label);
    context.set("lat", String(customerLocation.location.lat));
    context.set("lng", String(customerLocation.location.lng));
  }
  if (salon.services[0]?.id) context.set("style", salon.services[0].id);
  const contextSuffix = context.size ? `?${context}` : "";
  const profileHref = `/salon/${salon.slug}${contextSuffix}`;
  const bookHref = `/salon/${salon.slug}/book${contextSuffix}`;

  return (
    <article id={`salon-result-${salon.id}`} onMouseEnter={() => onFocus?.(salon.id)} onFocus={() => onFocus?.(salon.id)} className={`relative overflow-hidden rounded-[14px] border bg-white shadow-[0_5px_20px_rgba(26,18,32,.06)] transition ${selected ? "border-magenta ring-2 ring-magenta/20" : "border-plum/10"} ${isList ? "grid min-w-0 grid-cols-[118px_1fr] sm:grid-cols-[220px_1fr]" : "min-w-[76vw] snap-start sm:min-w-0"}`}>
      <Link href={profileHref} aria-label={`View ${salon.name}`} className={`relative block overflow-hidden bg-blush ${isList ? "min-h-[168px]" : "aspect-[16/10]"}`}>
        <SafeImage src={salon.cover_photo_url} fallbackSrc="/images/salon-warm.jpg" alt={`${salon.name} salon`} className="h-full w-full object-cover transition duration-500 hover:scale-[1.02]"/>
        {verified ? <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-plum/95 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-white"><ShieldCheck size={11}/>Verified</span> : null}
      </Link>
      <button type="button" aria-label={`Save ${salon.name} to favorites`} className="absolute right-2 top-2 z-10 grid min-h-10 min-w-10 place-items-center rounded-full bg-white/90 text-plum shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"><Heart size={17}/></button>
      <div className={`min-w-0 ${isList ? "grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:p-4" : "p-3"}`}>
        <div>
          <Link href={profileHref} className="font-serif text-lg font-semibold text-ink hover:text-magenta sm:text-xl">{salon.name}</Link>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink/65"><MapPin size={12}/>{area || "Location available on profile"}{Number.isFinite(salon.distance_miles) ? <> · {salon.distance_miles < 0.1 ? "Under 0.1" : salon.distance_miles.toFixed(1)} mi away</> : null}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            {salon.review_count > 0 && salon.rating_overall > 0 ? <span className="inline-flex items-center gap-1"><Star size={13} className="fill-amber text-amber"/><b>{Number(salon.rating_overall).toFixed(1)}</b> <span className="text-ink/55">({salon.review_count})</span></span> : <span className="rounded-full bg-blush px-2 py-1 font-bold text-plum">New</span>}
            {salon.starting_price !== null ? <span>From <b className="font-serif text-base">${Number(salon.starting_price).toFixed(0)}</b></span> : null}
          </div>
          {isList && salon.services.length ? <p className="mt-2 line-clamp-1 text-[10px] text-ink/55">{salon.services.map((service) => service.name).join(" · ")}</p> : null}
        </div>
        <div className={`flex items-end gap-2 ${isList ? "sm:flex-col sm:justify-end" : "mt-3"}`}>
          <Link href={profileHref} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-[8px] border border-magenta px-4 text-[11px] font-bold text-magenta">View salon</Link>
          <Link href={bookHref} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-[8px] bg-magenta px-4 text-[11px] font-bold text-white"><CalendarDays size={13}/>Book</Link>
        </div>
      </div>
    </article>
  );
}
