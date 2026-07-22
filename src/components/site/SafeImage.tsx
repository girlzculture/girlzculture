"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

export default function SafeImage({
  src,
  fallbackSrc,
  alt,
  className = "",
  priority = false,
  style,
  draggable,
}: {
  src?: string | null;
  fallbackSrc: string;
  alt: string;
  className?: string;
  priority?: boolean;
  style?: CSSProperties;
  draggable?: boolean;
}) {
  const desiredSrc = src || fallbackSrc;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const currentSrc = failedSrc === desiredSrc ? fallbackSrc : desiredSrc;

  return (
    // Dynamic salon uploads may come from more than one approved storage host.
    // A native image lets us guarantee a local visual fallback if an upload is unavailable.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => {
        if (currentSrc !== fallbackSrc) setFailedSrc(desiredSrc);
      }}
      className={className}
      style={style}
      draggable={draggable}
    />
  );
}
