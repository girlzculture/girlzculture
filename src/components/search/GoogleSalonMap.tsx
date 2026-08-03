/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/components/search/AutocompleteInputs";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { reportClientOperationalFailure } from "@/lib/supabase";

type MapSalon = { id: string; name: string; slug: string; starting_price?: number | null; startingPrice?: number | null; rating_overall?: number | null; review_count?: number | null; latitude?: number | null; longitude?: number | null };

export default function GoogleSalonMap({ salons, compact = false, selectedSalonId = "", onSelect }: { salons: MapSalon[]; compact?: boolean; selectedSalonId?: string; onSelect?: (salonId: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const markerButtons = useRef(new Map<string, HTMLButtonElement>());
  const [message, setMessage] = useState("");
  useEffect(() => {
    for (const [salonId, button] of markerButtons.current) {
      const selected = salonId === selectedSalonId;
      button.style.background = selected ? "#0083A6" : "#fff";
      button.style.color = selected ? "#fff" : "#0D1114";
      button.style.transform = selected ? "scale(1.08)" : "scale(1)";
      button.setAttribute("aria-pressed", String(selected));
    }
  }, [selectedSalonId]);
  useEffect(() => {
    let active = true;
    let clusterer: MarkerClusterer | null = null;
    let fallbackOverlays: any[] = [];
    const buttons = markerButtons.current;
    const mapped = salons.filter((salon) => Number.isFinite(Number(salon.latitude)) && Number.isFinite(Number(salon.longitude)));
    const timer = window.setTimeout(() => void (async () => {
      if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) { setMessage("Add the Google Maps API key to enable the live map."); return; }
      if (!mapped.length) { setMessage("These salons do not have map coordinates yet."); return; }
      try {
        await loadGoogleMaps();
        const maps = await (window as any).google.maps.importLibrary("maps");
        if (!active || !element.current) return;
        const first = mapped[0];
        const mapId = String(process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "").trim();
        const map = new maps.Map(element.current, { center: { lat: Number(first.latitude), lng: Number(first.longitude) }, zoom: 12, ...(mapId ? { mapId } : {}), mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
        const bounds = new (window as any).google.maps.LatLngBounds();
        buttons.clear();
        const markerLibrary = mapId ? await (window as any).google.maps.importLibrary("marker") : null;
        class SalonOverlay extends (window as any).google.maps.OverlayView {
          position: any;
          node: HTMLButtonElement;
          constructor(position: any, node: HTMLButtonElement) {
            super();
            this.position = position;
            this.node = node;
            this.node.style.position = "absolute";
            this.node.style.transform = "translate(-50%, -100%)";
          }
          onAdd() {
            this.getPanes()?.overlayMouseTarget.appendChild(this.node);
          }
          draw() {
            const pixel = this.getProjection()?.fromLatLngToDivPixel(this.position);
            if (!pixel) return;
            this.node.style.left = `${pixel.x}px`;
            this.node.style.top = `${pixel.y}px`;
          }
          onRemove() {
            this.node.remove();
          }
        }
        const markers = mapped.map((salon) => {
          const position = { lat: Number(salon.latitude), lng: Number(salon.longitude) };
          bounds.extend(position);
          const price = salon.starting_price ?? salon.startingPrice;
          const rating = Number(salon.rating_overall || 0);
          const reviews = Number(salon.review_count || 0);
          const openSalon = () => {
            onSelect?.(salon.id);
            window.location.assign(`/salon/${encodeURIComponent(salon.slug)}`);
          };
          const button = document.createElement("button");
          button.type = "button";
          button.title = `Open ${salon.name}`;
          button.setAttribute("aria-label", `Open ${salon.name}`);
          button.innerHTML = `<span style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${salon.name.replace(/[<>&"']/g, "")}</span><span style="font-size:10px;opacity:.72">${reviews > 0 ? `★ ${rating.toFixed(1)}` : "☆ New"}${price == null ? "" : ` · From $${Number(price).toFixed(0)}`}</span>`;
          button.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;gap:1px;min-height:42px;padding:6px 10px;border-radius:10px;background:#fff;color:#0D1114;font:700 11px Inter,sans-serif;box-shadow:0 5px 18px rgba(13,17,20,.2);border:2px solid #0083A6;cursor:pointer;transition:transform .15s ease";
          button.addEventListener("click", openSalon);
          buttons.set(salon.id, button);
          if (!markerLibrary) {
            const overlay = new SalonOverlay(
              new (window as any).google.maps.LatLng(position),
              button,
            );
            overlay.setMap(map);
            fallbackOverlays.push(overlay);
            return overlay;
          }
          return new markerLibrary.AdvancedMarkerElement({ map: mapped.length > 10 ? null : map, position, content: button, title: salon.name });
        });
        if (mapped.length > 10 && markerLibrary) clusterer = new MarkerClusterer({ map, markers });
        if (mapped.length > 1) map.fitBounds(bounds, 48);
      } catch {
        const report = await reportClientOperationalFailure({
          status: 502,
          code: "GOOGLE_MAP_LOAD_FAILED",
          operation: "maps:render-salon-results",
          provider: "google-maps",
        });
        if (active) setMessage(`${report.message} You can still use List view.`);
      }
    })(), 0);
    return () => { active = false; window.clearTimeout(timer); clusterer?.clearMarkers(); fallbackOverlays.forEach((overlay) => overlay.setMap(null)); fallbackOverlays = []; buttons.clear(); };
  }, [onSelect, salons]);
  return <div className={`relative overflow-hidden rounded-[12px] border border-plum/10 bg-blush/20 ${compact ? "sticky top-4 h-[560px]" : "mt-3 h-[540px]"}`}>{message ? <div className="grid h-full place-items-center p-8 text-center text-sm text-ink/60">{message}</div> : <div ref={element} className="h-full w-full"/>}</div>;
}
