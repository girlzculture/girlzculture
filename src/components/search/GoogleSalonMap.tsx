/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  GOOGLE_MAPS_AUTH_FAILURE_EVENT,
  GoogleMapsLoadError,
  loadGoogleMapsWithBoundedRetry,
  resetGoogleMapsLoader,
} from "@/components/search/AutocompleteInputs";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { reportClientOperationalFailure } from "@/lib/supabase";
import { formatDistanceMiles } from "@/lib/location";

export type MapSalon = { id: string; name: string; slug: string; starting_price?: number | null; startingPrice?: number | null; rating_overall?: number | null; review_count?: number | null; latitude?: number | null; longitude?: number | null; distance_miles?: number | null; matched_service?: { id: string; name: string; price: number | null } | null };

function mapPrice(value: unknown) {
  if (value === null || value === undefined || value === "")
    return "View pricing";
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return "View pricing";
  return `From $${amount.toFixed(Number.isInteger(amount) ? 0 : 2)}`;
}

export function SalonMapSelectionSummary({ salon }: { salon: MapSalon }) {
  const reviews = Number(salon.review_count || 0);
  const rating = Number(salon.rating_overall || 0);
  const bookingParams = new URLSearchParams();
  if (salon.matched_service?.id) bookingParams.set("style", salon.matched_service.id);
  const bookingHref = `/salon/${encodeURIComponent(salon.slug)}/book${bookingParams.size ? `?${bookingParams}` : ""}`;
  const price = salon.matched_service
    ? salon.matched_service.price
    : salon.starting_price ?? salon.startingPrice;
  return <aside aria-live="polite" data-map-salon-summary className="absolute inset-x-3 bottom-3 z-10 flex items-center justify-between gap-3 rounded-[12px] border border-plum/10 bg-white/95 p-3 shadow-[0_10px_30px_rgba(13,17,20,.18)] backdrop-blur"><div className="min-w-0"><p className="truncate font-serif text-base font-semibold text-plum">{salon.name}</p>{salon.matched_service ? <p className="truncate text-[10px] font-semibold text-plum">{salon.matched_service.name}</p> : null}<p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-ink/65">{reviews > 0 && rating > 0 ? <span>{rating.toFixed(1)} ({reviews})</span> : null}<span>{mapPrice(price)}</span><span>{formatDistanceMiles(salon.distance_miles)}</span></p></div><div className="flex shrink-0 gap-2"><Link href={`/salon/${encodeURIComponent(salon.slug)}`} className="inline-flex min-h-10 items-center rounded-[8px] border border-magenta bg-white px-3 text-[11px] font-bold text-magenta">View</Link><Link href={bookingHref} className="inline-flex min-h-10 items-center rounded-[8px] bg-magenta px-3 text-[11px] font-bold text-white">Book</Link></div></aside>;
}

export default function GoogleSalonMap({ salons, compact = false, selectedSalonId = "", onSelect }: { salons: MapSalon[]; compact?: boolean; selectedSalonId?: string; onSelect?: (salonId: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const markerButtons = useRef(new Map<string, HTMLButtonElement>());
  const [message, setMessage] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const selectedSalon = salons.find((salon) => salon.id === selectedSalonId) || null;
  useEffect(() => {
    for (const [salonId, button] of markerButtons.current) {
      const selected = salonId === selectedSalonId;
      button.style.background = selected ? "var(--gc-teal)" : "var(--gc-white)";
      button.style.color = selected
        ? "var(--gc-text-on-dark)"
        : "var(--gc-text-primary)";
      button.style.transform = selected ? "scale(1.08)" : "scale(1)";
      button.setAttribute("aria-pressed", String(selected));
    }
  }, [selectedSalonId]);
  useEffect(() => {
    let active = true;
    let clusterer: MarkerClusterer | null = null;
    let fallbackOverlays: any[] = [];
    let advancedMarkers: any[] = [];
    let authFailureHandled = false;
    const buttons = markerButtons.current;
    const mapped = salons.filter((salon) => Number.isFinite(Number(salon.latitude)) && Number.isFinite(Number(salon.longitude)));
    const presentFailure = async (error: GoogleMapsLoadError | null) => {
      const report = await reportClientOperationalFailure({
        status: 502,
        code: error?.code || "GOOGLE_MAP_RENDER_FAILED",
        operation: "maps:render-salon-results",
        provider: "google-maps",
      });
      if (!active) return;
      const actionable = error?.message || "Google Maps could not render these salon results. Check the Maps JavaScript API configuration and provider status.";
      setMessage(`${actionable}${report.reference ? ` Reference ${report.reference}.` : ""} You can still use List view.`);
      setRetryable(error?.code !== "GOOGLE_MAPS_NOT_CONFIGURED");
    };
    const onAuthenticationFailure = (event: Event) => {
      authFailureHandled = true;
      const detail = (event as CustomEvent<{ code?: string; message?: string }>).detail;
      void presentFailure(
        new GoogleMapsLoadError(
          "GOOGLE_MAPS_AUTH_REJECTED",
          detail?.message || "Google Maps rejected the API key or site referrer. Enable Maps JavaScript API and allow this site's HTTPS domain in Google Cloud.",
        ),
      );
    };
    window.addEventListener(
      GOOGLE_MAPS_AUTH_FAILURE_EVENT,
      onAuthenticationFailure,
    );
    const timer = window.setTimeout(() => void (async () => {
      setMessage("");
      setRetryable(false);
      if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) { setMessage("Google Maps is not configured. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to the deployed site environment."); return; }
      if (!mapped.length) { setMessage("These salons do not have map coordinates yet. Add latitude and longitude to each salon address."); return; }
      try {
        await loadGoogleMapsWithBoundedRetry();
        const maps = await (window as any).google.maps.importLibrary("maps");
        if (!active || !element.current) return;
        const first = mapped[0];
        const configuredMapId = String(process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "").trim();
        // Google's DEMO_MAP_ID is for samples and can be rate-limited or
        // rejected in production. The standards-based overlay works without
        // a Map ID and preserves the rich salon label/click behavior.
        const mapId = configuredMapId === "DEMO_MAP_ID" ? "" : configuredMapId;
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
          const price = salon.matched_service
            ? salon.matched_service.price
            : salon.starting_price ?? salon.startingPrice;
          const rating = Number(salon.rating_overall || 0);
          const reviews = Number(salon.review_count || 0);
          const openSalon = () => {
            onSelect?.(salon.id);
            if (!onSelect) window.location.assign(`/salon/${encodeURIComponent(salon.slug)}`);
          };
          const button = document.createElement("button");
          button.type = "button";
          button.title = `Open ${salon.name}`;
          button.setAttribute("aria-label", `Open ${salon.name}`);
          button.innerHTML = `<span style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${salon.name.replace(/[<>&"']/g, "")}</span><span style="font-size:10px;opacity:.72">${reviews > 0 ? `★ ${rating.toFixed(1)}` : ""}${reviews > 0 && price != null ? " · " : ""}${price == null ? "" : `From $${Number(price).toFixed(0)}`}</span>`;
          button.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;gap:1px;min-height:42px;padding:6px 10px;border-radius:10px;background:var(--gc-white);color:var(--gc-text-primary);font:700 11px Inter,sans-serif;box-shadow:0 5px 18px rgba(13,17,20,.2);border:2px solid var(--gc-teal);cursor:pointer;transition:transform .15s ease";
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
          const marker = new markerLibrary.AdvancedMarkerElement({ map: mapped.length > 10 ? null : map, position, content: button, title: salon.name });
          advancedMarkers.push(marker);
          return marker;
        });
        if (mapped.length > 10 && markerLibrary) clusterer = new MarkerClusterer({ map, markers });
        if (mapped.length > 1) map.fitBounds(bounds, 48);
      } catch (error) {
        const loadError = error instanceof GoogleMapsLoadError ? error : null;
        if (!authFailureHandled) await presentFailure(loadError);
      }
    })(), 0);
    return () => { active = false; window.removeEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, onAuthenticationFailure); window.clearTimeout(timer); clusterer?.clearMarkers(); advancedMarkers.forEach((marker) => { marker.map = null; }); advancedMarkers = []; fallbackOverlays.forEach((overlay) => overlay.setMap(null)); fallbackOverlays = []; buttons.clear(); };
  }, [loadAttempt, onSelect, salons]);
  return <div className={`relative overflow-hidden rounded-[12px] border border-plum/10 bg-blush/20 ${compact ? "sticky top-4 h-[560px]" : "mt-3 h-[540px]"}`}>{message ? <div className="grid h-full place-items-center p-8 text-center text-sm text-ink/60"><div><p>{message}</p>{retryable ? <button type="button" onClick={() => { resetGoogleMapsLoader(); setLoadAttempt((value) => value + 1); }} className="mt-4 min-h-11 rounded-[10px] border border-magenta bg-white px-5 font-bold text-magenta">Retry map</button> : null}</div></div> : <><div ref={element} className="h-full w-full"/>{selectedSalon ? <SalonMapSelectionSummary salon={selectedSalon} /> : null}</>}</div>;
}
