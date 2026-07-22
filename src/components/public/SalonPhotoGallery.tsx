"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImageOff, Images, Minus, Plus, X } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";

export default function SalonPhotoGallery({ photos, salonName }: { photos: string[]; salonName: string }) {
  const available = useMemo(() => photos.filter(Boolean), [photos]);
  const tiles = Array.from({ length: 5 }, (_, index) => available[index] || null);
  const remaining = Math.max(0, available.length - 5);
  const [active, setActive] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const touchStart = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);

  function close() { setActive(null); setZoom(1); }
  function move(direction: -1 | 1) {
    if (active === null || !available.length) return;
    setActive((active + direction + available.length) % available.length);
    setZoom(1);
  }

  useEffect(() => {
    if (active === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); };
  }, [active, available.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function pointerDown(event: React.PointerEvent) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 1) touchStart.current = event.clientX;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  function pointerMove(event: React.PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size !== 2 || !pinchDistance.current) return;
    const [a, b] = [...pointers.current.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const ratio = distance / pinchDistance.current;
    setZoom((current) => Math.min(4, Math.max(1, current * ratio)));
    pinchDistance.current = distance;
  }
  function pointerUp(event: React.PointerEvent) {
    const start = touchStart.current;
    pointers.current.delete(event.pointerId);
    pinchDistance.current = null;
    if (!pointers.current.size && start !== null && zoom <= 1.02) {
      const delta = event.clientX - start;
      if (Math.abs(delta) > 55) move(delta > 0 ? -1 : 1);
    }
    if (!pointers.current.size) touchStart.current = null;
  }

  return <>
    <div className="relative grid h-[232px] grid-cols-[1.2fr_1fr] gap-1.5 overflow-hidden rounded-[10px] sm:h-[330px] lg:h-[356px]">
      <Tile photo={tiles[0]} label={`${salonName} featured work`} priority onOpen={() => tiles[0] && setActive(0)} className="rounded-[8px]" />
      <div className="grid grid-cols-2 grid-rows-2 gap-1.5">
        {tiles.slice(1).map((photo, index) => <Tile key={`${photo || "empty"}-${index}`} photo={photo} label={`${salonName} gallery ${index + 2}`} onOpen={() => photo && setActive(index + 1)} className="rounded-[7px]" overlay={index === 3 && remaining ? `+${remaining}\nView all` : undefined} />)}
      </div>
      {available.length ? <button type="button" onClick={()=>setActive(0)} className="absolute bottom-3 right-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-white/95 px-3 text-[10px] font-bold text-plum shadow-lg"><Images size={15}/>View all photos</button> : null}
    </div>

    {active !== null && available[active] ? <div role="dialog" aria-modal="true" aria-label={`${salonName} photo gallery`} className="fixed inset-0 z-[100] flex flex-col bg-ink/95 p-3 text-white sm:p-6">
      <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">{salonName} · Photo {active + 1} of {available.length}</p><div className="flex items-center gap-2"><button type="button" aria-label="Zoom out" onClick={()=>setZoom(value=>Math.max(1,value-.5))} className="grid h-11 w-11 place-items-center rounded-full bg-white/10"><Minus/></button><button type="button" aria-label="Zoom in" onClick={()=>setZoom(value=>Math.min(4,value+.5))} className="grid h-11 w-11 place-items-center rounded-full bg-white/10"><Plus/></button><button type="button" aria-label="Close photo gallery" onClick={close} className="grid h-11 w-11 place-items-center rounded-full bg-white/10"><X/></button></div></div>
      <div className="relative mt-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden touch-none" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onContextMenu={event=>event.preventDefault()}>
        <button type="button" aria-label="Previous photo" onClick={()=>move(-1)} className="absolute left-1 z-10 grid h-12 w-12 place-items-center rounded-full bg-white/10 backdrop-blur sm:left-4"><ArrowLeft/></button>
        <SafeImage src={available[active]} fallbackSrc={available[active]} alt={`${salonName} gallery photo ${active + 1}`} draggable={false} className="max-h-full max-w-full select-none object-contain transition-transform duration-150" style={{ transform: `scale(${zoom})` }} />
        <button type="button" aria-label="Next photo" onClick={()=>move(1)} className="absolute right-1 z-10 grid h-12 w-12 place-items-center rounded-full bg-white/10 backdrop-blur sm:right-4"><ArrowRight/></button>
      </div>
      <p className="pt-3 text-center text-[10px] text-white/65">Use arrow keys or swipe to browse. Pinch or use the zoom controls to inspect a photo.</p>
    </div> : null}
  </>;
}

function Tile({ photo, label, priority=false, onOpen, overlay, className }: { photo: string | null; label: string; priority?: boolean; onOpen: ()=>void; overlay?: string; className: string }) {
  return <button type="button" disabled={!photo} aria-label={photo ? `Open ${label}` : "No salon photo uploaded"} onClick={onOpen} className={`relative overflow-hidden bg-blush text-left disabled:cursor-default ${className}`}>
    {photo ? <SafeImage src={photo} fallbackSrc={photo} alt={label} priority={priority} draggable={false} className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]" /> : <span className="grid h-full place-items-center text-plum/25"><ImageOff size={priority ? 46 : 28} strokeWidth={1.2} aria-hidden="true" /></span>}
    {overlay ? <span className="absolute inset-0 flex items-center justify-center whitespace-pre-line bg-ink/55 text-center font-serif text-[16px] font-semibold leading-5 text-white">{overlay}</span> : null}
  </button>;
}
