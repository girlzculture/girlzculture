"use client";

import { useEffect, useRef, useState } from "react";
import { responsiveMediaSources } from "@/lib/responsiveMedia";
import type { BusinessPhotoAsset } from "@/lib/businessSignupMedia";

export default function BusinessPhoto({ photo, priority = false, fallbackSrc }: { photo: BusinessPhotoAsset; priority?: boolean; fallbackSrc?: string }) {
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState("");
  const useFallback = failed === photo.src;
  const src = useFallback && fallbackSrc ? fallbackSrc : photo.src;
  const sources = useFallback ? null : responsiveMediaSources(src);
  const mobile = useFallback ? undefined : photo.mobileSrc || sources?.mobile;
  useEffect(() => {
    // Eager SSR media may fail before React attaches its error listener.
    if (image.current?.complete && image.current.naturalWidth === 0) setFailed(photo.src);
  }, [photo.src]);
  return <span className="business-photo" style={{ position: "relative", display: "block", width: "100%", aspectRatio: photo.aspectRatio, height: photo.aspectRatio ? "auto" : undefined }}>
    {src ? <picture>
      {mobile ? <source media="(max-width: 767px)" srcSet={mobile} /> : null}
      {sources ? <source media="(min-width: 768px) and (max-width: 1199px)" srcSet={sources.tablet} /> : null}
      {/* The platform's canonical responsive rendition URLs already provide optimized media. */}
      <img ref={image} src={src} alt={photo.alt} loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setFailed(photo.src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: photo.objectFit ?? "cover", objectPosition: photo.objectPosition ?? "50% 50%" }} />
    </picture> : null}
  </span>;
}
