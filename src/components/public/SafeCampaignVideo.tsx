"use client";

import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";

type SafeCampaignVideoProps = {
  src: string;
  poster?: string | null;
  label: string;
  className?: string;
};

export default function SafeCampaignVideo({ src, poster, label, className = "" }: SafeCampaignVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      setNearViewport(entry.isIntersecting);
      if (!entry.isIntersecting) videoRef.current?.pause();
    }, { rootMargin: "240px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`relative bg-ink ${className}`}>
      {failed ? (
        <div role="img" aria-label={`${label} video unavailable`} className="grid h-full min-h-44 place-items-center bg-[linear-gradient(145deg,#251029,#5b1a6b)] p-5 text-center text-white">
          <span><Film className="mx-auto mb-2" aria-hidden="true" /><span className="block text-xs font-semibold">Video preview unavailable</span></span>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={nearViewport ? src : undefined}
          poster={poster || undefined}
          controls
          muted
          playsInline
          preload="none"
          aria-label={label}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
