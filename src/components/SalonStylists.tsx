"use client";

import SafeImage from "@/components/site/SafeImage";

type StylistRecord = {
  id?: string;
  name?: string | null;
  specialties?: string[] | string | null;
  bio?: string | null;
  avatar_url?: string | null;
  photos?: string[] | string | null;
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

function experienceLabel(bio?: string | null) {
  const match = bio?.match(/(\d+)\+?\s+years?/i);
  return match ? `${match[1]}+ years experience` : "Experience not provided";
}

export default function SalonStylists({
  stylists,
  fallbackPhotos,
}: {
  stylists: StylistRecord[];
  salonRating: number;
  fallbackPhotos: string[];
}) {
  if (!stylists.length) {
    return <div className="rounded-[12px] border border-dashed border-plum/20 bg-blush/25 p-5 text-sm text-ink/65">This salon has not published its stylist profiles yet.</div>;
  }

  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
      {stylists.map((stylist, stylistIndex) => {
        const savedPhotos = normalizeList(stylist.photos);
        const avatar = stylist.avatar_url || savedPhotos[0] || fallbackPhotos[stylistIndex % fallbackPhotos.length];
        const portfolio = savedPhotos;
        const specialties = normalizeList(stylist.specialties);

        return (
          <article key={stylist.id || stylist.name} className="w-[78vw] max-w-[310px] shrink-0 snap-start overflow-hidden rounded-[12px] border border-plum/10 bg-white/85 shadow-[0_5px_18px_rgba(26,18,32,0.05)] lg:w-full lg:max-w-none">
            <div className="flex gap-3 p-3">
              <div className="relative h-[94px] w-[86px] shrink-0 overflow-hidden rounded-[9px] bg-blush">
                <SafeImage src={avatar} fallbackSrc={fallbackPhotos[stylistIndex % fallbackPhotos.length]} alt={stylist.name || "Stylist"} className="h-full w-full object-cover" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-serif text-[17px] font-semibold leading-tight text-ink">{stylist.name || "Stylist"}</h3>
                    <p className="mt-1 text-[9px] text-ink/55">{experienceLabel(stylist.bio)}</p>
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-ink/65">{specialties.length ? specialties.join(" · ") : "Specialties not listed"}</p>

                {portfolio.length ? <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {portfolio.slice(0, 4).map((photo, index) => (
                    <div key={`${photo}-${index}`} className="relative h-8 overflow-hidden rounded-[5px] bg-blush">
                      <SafeImage src={photo} fallbackSrc={fallbackPhotos[(stylistIndex + index) % fallbackPhotos.length]} alt={`${stylist.name || "Stylist"} work ${index + 1}`} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div> : <p className="mt-2 text-[8px] text-ink/45">Portfolio photos not added yet.</p>}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
