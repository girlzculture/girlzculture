"use client";

import { useState } from "react";
import { Check, Heart, Share2 } from "lucide-react";

export default function SalonProfileActions({ salonId, salonName }: { salonId: string; salonName: string }) {
  const [favorite, setFavorite] = useState(false);
  const [shared, setShared] = useState(false);

  const toggleFavorite = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("girlz-culture-favorites") || "[]") as string[];
      const next = saved.includes(salonId) ? saved.filter((id) => id !== salonId) : [...saved, salonId];
      window.localStorage.setItem("girlz-culture-favorites", JSON.stringify(next));
      setFavorite(next.includes(salonId));
    } catch {
      setFavorite((current) => !current);
    }
  };

  const shareSalon = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: salonName, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      setShared(false);
    }
  };

  const actionClass = "inline-flex h-11 w-12 items-center justify-center rounded-[10px] border border-plum/10 bg-white text-magenta shadow-sm transition hover:border-magenta/30 hover:bg-blush/25";

  return (
    <div className="flex gap-2">
      <button type="button" onClick={shareSalon} aria-label="Share salon" className={actionClass}>
        {shared ? <Check size={19} /> : <Share2 size={19} />}
      </button>
      <button type="button" onClick={toggleFavorite} aria-label={favorite ? "Remove salon from favorites" : "Add salon to favorites"} aria-pressed={favorite} className={actionClass}>
        <Heart size={20} fill={favorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
