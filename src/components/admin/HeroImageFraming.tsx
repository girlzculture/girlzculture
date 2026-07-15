/* eslint-disable @next/next/no-img-element */
"use client";

import { PointerEvent, useRef } from "react";

export default function HeroImageFraming({
  imageUrl,
  positionX,
  positionY,
  zoom,
  onChange,
}: {
  imageUrl?: string;
  positionX: number;
  positionY: number;
  zoom: number;
  onChange: (value: { positionX: number; positionY: number; zoom: number }) => void;
}) {
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    drag.current = { x: event.clientX, y: event.clientY, startX: positionX, startY: positionY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    onChange({
      positionX: clamp(drag.current.startX - ((event.clientX - drag.current.x) / bounds.width) * 100, 0, 100),
      positionY: clamp(drag.current.startY - ((event.clientY - drag.current.y) / bounds.height) * 100, 0, 100),
      zoom,
    });
  }

  return <section className="mt-4 rounded-xl border border-plum/10 bg-cream/45 p-4">
    <div className="flex items-end justify-between gap-3"><div><h3 className="font-serif text-xl text-plum">Hero framing</h3><p className="mt-1 text-xs text-ink/55">Drag the preview to reposition the subject. Use zoom to crop more tightly.</p></div><button type="button" onClick={() => onChange({ positionX: 50, positionY: 50, zoom: 1 })} className="text-xs font-bold text-magenta">Reset</button></div>
    <div onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} className="relative mt-3 aspect-[16/6] touch-none cursor-move overflow-hidden rounded-xl bg-blush">
      {imageUrl ? <img src={imageUrl} alt="Hero framing preview" draggable={false} className="pointer-events-none h-full w-full select-none object-cover" style={{ objectPosition: `${positionX}% ${positionY}%`, transform: `scale(${zoom})` }} /> : <div className="grid h-full place-items-center text-sm text-ink/50">Upload a hero image to preview its framing.</div>}
      <div className="pointer-events-none absolute inset-0 border border-white/50" />
    </div>
    <label className="mt-4 block text-xs font-bold">Crop / zoom ({zoom.toFixed(2)}Ã—)<input aria-label="Hero zoom" type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={(event) => onChange({ positionX, positionY, zoom: Number(event.target.value) })} className="mt-2 w-full accent-magenta" /></label>
    <p className="mt-2 text-[10px] text-ink/50">Position: {Math.round(positionX)}% horizontal, {Math.round(positionY)}% vertical</p>
  </section>;
}
