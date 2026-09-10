"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { type BusinessSignupVideo } from "@/lib/businessSignupMedia";
import { DEFAULT_BUSINESS_SIGNUP_CONTENT, type BusinessSignupContent, type BusinessSignupImage } from "@/lib/businessSignupContent";
import BusinessPhoto from "./BusinessPhoto";

function HeroVideo({ source }: { source: BusinessSignupVideo }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let attempt = 0;
    const showPoster = () => { element.style.visibility = "hidden"; };
    const showPlayback = () => { if (!motion.matches) element.style.visibility = "visible"; };
    const update = () => {
      const currentAttempt = ++attempt;
      showPoster();
      if (motion.matches) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      } else {
        element.src = source.src;
        void element.play().catch(() => { if (attempt === currentAttempt) showPoster(); });
      }
    };
    element.addEventListener("playing", showPlayback);
    element.addEventListener("error", showPoster);
    update();
    motion.addEventListener("change", update);
    return () => {
      ++attempt;
      motion.removeEventListener("change", update);
      element.removeEventListener("playing", showPlayback);
      element.removeEventListener("error", showPoster);
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [source.src]);

  return <div className="business-hero-video">
    <BusinessPhoto photo={source.poster} priority />
    <video ref={video} autoPlay muted loop playsInline controls={false} disablePictureInPicture tabIndex={-1} poster={source.poster.src} preload="none" aria-hidden="true" style={{ objectPosition: source.objectPosition ?? "50% 50%" }} />
  </div>;
}

const photo = (image: BusinessSignupImage) => ({ src: image.src, mobileSrc: image.src === "/images/business/business-signup-hero.avif" ? "/images/business/business-signup-hero-mobile.avif" : undefined, alt: image.alt, objectFit: image.fit, objectPosition: `${image.focalX}% ${image.focalY}%` });
const motionQuery = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (callback: () => void) => {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};

export default function BusinessSignupMedia({ media = DEFAULT_BUSINESS_SIGNUP_CONTENT.hero.media, video }: { media?: BusinessSignupContent["hero"]["media"]; video?: BusinessSignupVideo }) {
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true);
  const source = video || (media.type === "video" && media.src ? { src: media.src, poster: photo(media.poster), objectPosition: `${media.focalX}% ${media.focalY}%` } : undefined);
  const still = media.type === "gif" && reducedMotion ? media.poster : media;
  return <div className="business-hero-media" aria-hidden="true">
    {source ? <HeroVideo key={source.src} source={source} /> : media.type !== "none" && still.src ? <BusinessPhoto key={still.src} photo={photo(still)} fallbackSrc={media.poster.src} priority /> : null}
  </div>;
}
