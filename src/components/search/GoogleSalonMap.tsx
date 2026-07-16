/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/components/search/AutocompleteInputs";
import { MarkerClusterer } from "@googlemaps/markerclusterer";

type MapSalon = { id: string; name: string; slug: string; starting_price?: number | null; startingPrice?: number | null; latitude?: number | null; longitude?: number | null };

export default function GoogleSalonMap({ salons, compact = false, selectedSalonId = "", onSelect }: { salons: MapSalon[]; compact?: boolean; selectedSalonId?: string; onSelect?: (salonId: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const markerButtons = useRef(new Map<string, HTMLButtonElement>());
  const [message, setMessage] = useState("");
  useEffect(() => {
    for (const [salonId, button] of markerButtons.current) {
      const selected = salonId === selectedSalonId;
      button.style.background = selected ? "#5B1A6B" : "#fff";
      button.style.color = selected ? "#fff" : "#5B1A6B";
      button.style.transform = selected ? "scale(1.08)" : "scale(1)";
      button.setAttribute("aria-pressed", String(selected));
    }
  }, [selectedSalonId]);
  useEffect(() => {
    let active = true;
    let clusterer: MarkerClusterer | null = null;
    const buttons = markerButtons.current;
    const mapped = salons.filter((salon) => Number.isFinite(Number(salon.latitude)) && Number.isFinite(Number(salon.longitude)));
    const timer = window.setTimeout(() => void (async () => {
      if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) { setMessage("Add the Google Maps API key to enable the live map."); return; }
      if (!mapped.length) { setMessage("These salons do not have map coordinates yet."); return; }
      try {
        await loadGoogleMaps();
        const maps = await (window as any).google.maps.importLibrary("maps");
        const markerLibrary = await (window as any).google.maps.importLibrary("marker");
        if (!active || !element.current) return;
        const first = mapped[0];
        const map = new maps.Map(element.current, { center: { lat: Number(first.latitude), lng: Number(first.longitude) }, zoom: 12, mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID", mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
        const bounds = new (window as any).google.maps.LatLngBounds();
        buttons.clear();
        const markers = mapped.map((salon) => {
          const position = { lat: Number(salon.latitude), lng: Number(salon.longitude) };
          bounds.extend(position);
          const button = document.createElement("button");
          button.type = "button";
          button.title = `Show ${salon.name}`;
          button.setAttribute("aria-label", `Show ${salon.name} in the result list`);
          const price = salon.starting_price ?? salon.startingPrice;
          button.textContent = price == null ? salon.name : `$${price}`;
          button.style.cssText = "display:inline-flex;align-items:center;min-height:34px;padding:5px 10px;border-radius:999px;background:#fff;color:#5B1A6B;font:700 12px Inter,sans-serif;box-shadow:0 5px 18px rgba(26,18,32,.25);border:2px solid #D6186B;cursor:pointer;transition:transform .15s ease";
          button.addEventListener("click", () => { onSelect?.(salon.id); document.getElementById(`salon-result-${salon.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); });
          buttons.set(salon.id, button);
          return new markerLibrary.AdvancedMarkerElement({ map: mapped.length > 10 ? null : map, position, content: button, title: salon.name });
        });
        if (mapped.length > 10) clusterer = new MarkerClusterer({ map, markers });
        if (mapped.length > 1) map.fitBounds(bounds, 48);
      } catch (error) { console.error("Google salon map failed", error); if (active) setMessage("The live map could not load. You can still use List view."); }
    })(), 0);
    return () => { active = false; window.clearTimeout(timer); clusterer?.clearMarkers(); buttons.clear(); };
  }, [onSelect, salons]);
  return <div className={`relative overflow-hidden rounded-[12px] border border-plum/10 bg-blush/20 ${compact ? "sticky top-4 h-[560px]" : "mt-3 h-[540px]"}`}>{message ? <div className="grid h-full place-items-center p-8 text-center text-sm text-ink/60">{message}</div> : <div ref={element} className="h-full w-full"/>}</div>;
}
