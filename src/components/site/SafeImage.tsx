"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { responsiveMediaSources } from "@/lib/responsiveMedia";

export default function SafeImage({
  src,
  fallbackSrc,
  alt,
  className = "",
  priority = false,
  style,
  draggable,
  rendition = "responsive",
}: {
  src?: string | null;
  fallbackSrc: string;
  alt: string;
  className?: string;
  priority?: boolean;
  style?: CSSProperties;
  draggable?: boolean;
  rendition?: "responsive" | "thumbnail";
}) {
  const desiredSrc = src || fallbackSrc;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [failedThumbnailSrc, setFailedThumbnailSrc] = useState<string | null>(
    null,
  );
  const baseSrc = failedSrc === desiredSrc ? fallbackSrc : desiredSrc;
  const responsiveSources = responsiveMediaSources(baseSrc);
  const useThumbnail =
    rendition === "thumbnail" &&
    Boolean(responsiveSources) &&
    failedThumbnailSrc !== baseSrc;
  const currentSrc =
    useThumbnail && responsiveSources ? responsiveSources.thumbnail : baseSrc;

  const image = (
    // Dynamic salon uploads may come from more than one approved storage host.
    // A native image lets us guarantee a local visual fallback if an upload is unavailable.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => {
        if (useThumbnail) {
          setFailedThumbnailSrc(baseSrc);
        } else if (baseSrc !== fallbackSrc) {
          setFailedSrc(desiredSrc);
        }
      }}
      className={className}
      style={style}
      draggable={draggable}
    />
  );

  if (!responsiveSources || rendition === "thumbnail") return image;

  return (
    <picture className="contents">
      <source
        media="(max-width: 767px)"
        srcSet={responsiveSources.mobile}
      />
      <source
        media="(min-width: 768px) and (max-width: 1199px)"
        srcSet={responsiveSources.tablet}
      />
      {image}
    </picture>
  );
}
