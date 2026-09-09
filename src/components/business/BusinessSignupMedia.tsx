"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { BUSINESS_SIGNUP_MEDIA, type BusinessSignupPanel } from "@/lib/businessSignupMedia";

function Panel({ panel }: { panel: BusinessSignupPanel }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element || !panel.videoUrl) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (motion.matches) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      } else {
        element.src = panel.videoUrl!;
        void element.play().catch(() => { /* Poster remains when autoplay is unavailable. */ });
      }
    };
    update();
    motion.addEventListener("change", update);
    return () => { motion.removeEventListener("change", update); element.pause(); };
  }, [panel.videoUrl]);

  return <div className="business-hero-panel" data-business-media-panel={panel.id}>
    <Image src={panel.poster} alt="" fill sizes="25vw" priority style={{ objectFit: "cover", objectPosition: panel.position }} />
    {panel.videoUrl ? <video ref={video} autoPlay muted loop playsInline controls={false} poster={panel.poster} preload="none" aria-hidden="true" style={{ objectPosition: panel.position }} onError={event => { event.currentTarget.style.visibility = "hidden"; }} /> : null}
  </div>;
}

export default function BusinessSignupMedia({ panels = BUSINESS_SIGNUP_MEDIA }: { panels?: readonly BusinessSignupPanel[] }) {
  return <div className="business-hero-media" aria-hidden="true">{panels.map(panel => <Panel key={panel.id} panel={panel} />)}</div>;
}
