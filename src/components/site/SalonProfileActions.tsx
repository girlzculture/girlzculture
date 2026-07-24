"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Check,
  Camera,
  ExternalLink,
  Heart,
  Link2,
  QrCode,
  Share2,
  X,
} from "lucide-react";
import { salonPublicPath } from "@/lib/salonVanity";

type Props = {
  salonId: string;
  salonName: string;
  salonSlug: string;
  vanitySlug?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  googleBusinessUrl?: string | null;
};

export default function SalonProfileActions({
  salonId,
  salonName,
  salonSlug,
  vanitySlug,
  instagramUrl,
  tiktokUrl,
  googleBusinessUrl,
}: Props) {
  const [favorite, setFavorite] = useState(false);
  const [shared, setShared] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const publicPath = salonPublicPath(salonSlug, vanitySlug);
  const publicUrl = () => `${window.location.origin}${publicPath}`;

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
        await navigator.share({ title: salonName, url: publicUrl() });
      } else {
        await navigator.clipboard.writeText(publicUrl());
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      setShared(false);
    }
  };

  const actionClass = "inline-flex h-11 w-12 items-center justify-center rounded-[10px] border border-plum/10 bg-white text-magenta shadow-sm transition hover:border-magenta/30 hover:bg-blush/25";

  return (
    <div className="relative flex gap-2">
      <button
        type="button"
        onClick={() => void shareSalon()}
        aria-label="Copy or share salon link"
        title="Copy or share salon link"
        className={actionClass}
      >
        {shared ? <Check size={19} /> : <Share2 size={19} />}
      </button>
      {vanitySlug ? (
        <button
          type="button"
          onClick={() => setShowShare((value) => !value)}
          aria-label="Show salon QR code and social links"
          aria-expanded={showShare}
          title="QR code and social links"
          className={actionClass}
        >
          <QrCode size={19} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={toggleFavorite}
        aria-label={
          favorite ? "Remove salon from favorites" : "Add salon to favorites"
        }
        aria-pressed={favorite}
        className={actionClass}
      >
        <Heart size={20} fill={favorite ? "currentColor" : "none"} />
      </button>
      {showShare && vanitySlug ? (
        <section className="absolute right-0 top-14 z-30 w-[min(82vw,280px)] rounded-[14px] border border-plum/10 bg-white p-4 shadow-[0_18px_50px_rgba(26,18,32,.18)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-serif text-lg text-plum">Share this salon</p>
              <p className="mt-1 break-all text-[10px] text-ink/55">
                girlzculture.com/{vanitySlug}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowShare(false)}
              aria-label="Close sharing panel"
              className="grid h-8 w-8 place-items-center rounded-full hover:bg-blush"
            >
              <X size={15} />
            </button>
          </div>
          <Image
            src={`/api/salons/${vanitySlug}/qr`}
            alt={`QR code for ${salonName}`}
            width={144}
            height={144}
            unoptimized
            className="mx-auto mt-3 h-36 w-36 rounded-lg bg-cream p-2"
          />
          <button
            type="button"
            onClick={() => void shareSalon()}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-magenta px-3 text-xs font-bold text-white"
          >
            {shared ? <Check size={15} /> : <Link2 size={15} />}
            {shared ? "Link copied" : "Copy salon link"}
          </button>
          {[instagramUrl, tiktokUrl, googleBusinessUrl].some(Boolean) ? (
            <div className="mt-3 flex flex-wrap justify-center gap-3 border-t border-plum/10 pt-3 text-[11px] font-semibold text-plum">
              {instagramUrl ? (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  <Camera size={14} /> Instagram
                </a>
              ) : null}
              {tiktokUrl ? (
                <a
                  href={tiktokUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  <ExternalLink size={14} /> TikTok
                </a>
              ) : null}
              {googleBusinessUrl ? (
                <a
                  href={googleBusinessUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  <ExternalLink size={14} /> Google
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
