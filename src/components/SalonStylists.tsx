"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Star, UserRound } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";

type StylistRecord = {
  id?: string;
  name?: string | null;
  specialties?: string[] | string | null;
  bio?: string | null;
  avatar_url?: string | null;
  photos?: string[] | string | null;
  years_experience?: number | null;
  rating?: number | null;
};

function normalizeList(value: string[] | string | null | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((entry): entry is string => typeof entry === "string" && Boolean(entry));
    } catch {
      return value.split(",").map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [];
}

export default function SalonStylists({ stylists, salonSlug }: { stylists: StylistRecord[]; salonSlug: string }) {
  if (!stylists.length) {
    return <div className="rounded-[14px] border border-dashed border-plum/20 bg-blush/25 p-6 text-sm text-ink/65">This salon has not published its stylist profiles yet.</div>;
  }

  return (
    <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
      {stylists.map((stylist) => {
        const portfolio = normalizeList(stylist.photos);
        const specialties = normalizeList(stylist.specialties);
        const experience = Number(stylist.years_experience || 0);
        const rating = Number(stylist.rating || 0);

        return (
          <Link
            key={stylist.id || stylist.name}
            href={`/salon/${salonSlug}/stylist/${stylist.id}`}
            className="group w-[82vw] max-w-[360px] shrink-0 snap-start overflow-hidden rounded-[15px] border border-plum/10 bg-white shadow-[0_8px_24px_rgba(26,18,32,0.06)] transition hover:-translate-y-0.5 hover:border-magenta/30 hover:shadow-[0_14px_34px_rgba(26,18,32,0.10)] lg:w-full lg:max-w-none"
          >
            <div className="grid grid-cols-[116px_1fr] gap-4 p-4">
              <div className="relative h-[138px] overflow-hidden rounded-[12px] bg-blush/60">
                {stylist.avatar_url ? (
                  <SafeImage src={stylist.avatar_url} fallbackSrc={stylist.avatar_url} alt={stylist.name || "Stylist"} className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-plum/45"><UserRound size={46} strokeWidth={1.3} aria-hidden="true" /></span>
                )}
              </div>

              <div className="min-w-0 py-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-serif text-[22px] font-semibold leading-tight text-ink">{stylist.name || "Stylist"}</h3>
                  {rating > 0 ? <span className="inline-flex items-center gap-1 text-[12px] font-bold text-ink"><Star size={13} className="fill-amber text-amber" />{rating.toFixed(1)}</span> : null}
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-ink/60"><BriefcaseBusiness size={13} className="text-magenta" />{experience > 0 ? `${experience} ${experience === 1 ? "year" : "years"} experience` : "Experience details coming soon"}</p>
                <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-ink/65">{specialties.length ? specialties.join(" · ") : stylist.bio || "Specialties not listed"}</p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-magenta">View profile <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
              </div>
            </div>

            {portfolio.length ? (
              <div className="grid grid-cols-4 gap-1.5 border-t border-plum/10 p-3">
                {portfolio.slice(0, 4).map((photo, index) => (
                  <div key={`${photo}-${index}`} className="relative h-14 overflow-hidden rounded-[7px] bg-blush">
                    <SafeImage src={photo} fallbackSrc={photo} alt={`${stylist.name || "Stylist"} work ${index + 1}`} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
