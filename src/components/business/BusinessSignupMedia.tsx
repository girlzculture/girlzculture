"use client";

import { useEffect, useRef } from "react";
import { BUSINESS_SIGNUP_HERO_VIDEO, BUSINESS_SIGNUP_MEDIA, type BusinessSignupPanel, type BusinessSignupVideo } from "@/lib/businessSignupMedia";
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
    <video ref={video} autoPlay muted loop playsInline controls={false} disablePictureInPicture tabIndex={-1} poster={source.poster.src} preload="none" aria-hidden="true" style={{ objectPosition: source.poster.objectPosition ?? "50% 50%" }} />
  </div>;
}

export default function BusinessSignupMedia({ panels = BUSINESS_SIGNUP_MEDIA, video = BUSINESS_SIGNUP_HERO_VIDEO }: { panels?: readonly BusinessSignupPanel[]; video?: BusinessSignupVideo }) {
  return <div className="business-hero-media" aria-hidden="true">
    {panels.map(panel => <div key={panel.id} className="business-hero-panel" data-business-media-panel={panel.id} style={video ? { visibility: "hidden" } : undefined}>
      <BusinessPhoto photo={panel.photo} priority />
    </div>)}
    {video ? <HeroVideo key={video.src} source={video} /> : null}
  </div>;
}
