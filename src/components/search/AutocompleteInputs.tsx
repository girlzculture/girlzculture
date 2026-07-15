/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";

let googleMapsPromise: Promise<void> | null = null;
export function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps requires a browser."));
  if ((window as any).google?.maps?.importLibrary) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error("Google Maps is not configured."));
  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("girlz-google-maps") as HTMLScriptElement | null;
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("Google Maps failed to load.")), { once: true }); return; }
    const script = document.createElement("script");
    script.id = "girlz-google-maps";
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=places,marker`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

type SharedProps = { value: string; onChange: (value: string) => void; placeholder?: string; className?: string; name?: string };

export function StyleAutocomplete({ value, onChange, placeholder = "Search services", className = "", name = "style" }: SharedProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggestions?type=style&q=${encodeURIComponent(value)}`);
        const body = await response.json();
        setSuggestions(response.ok && Array.isArray(body.suggestions) ? body.suggestions : []);
      } catch { setSuggestions([]); }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [value]);
  useEffect(() => {
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return <div ref={root} className={`relative ${className}`}><span className="flex min-h-11 items-center gap-2"><Search size={18} className="shrink-0 text-magenta"/><input name={name} value={value} onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} autoComplete="off" placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-xs outline-none sm:text-sm"/></span>{open && suggestions.length ? <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-plum/10 bg-white py-1 shadow-2xl">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { onChange(suggestion); setOpen(false); }} className="block w-full px-4 py-3 text-left text-xs hover:bg-blush/40">{suggestion}</button>)}</div> : null}</div>;
}

export function LocationAutocomplete({ value, onChange, onCoordinates, placeholder = "City, neighborhood, or ZIP", className = "", name = "location" }: SharedProps & { onCoordinates?: (coordinates: { lat: number; lng: number } | null) => void }) {
  const [suggestions, setSuggestions] = useState<Array<{ text: string; prediction: any }>>([]);
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY));
  const sessionToken = useRef<any>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (value.trim().length < 2 || !configured) { setSuggestions([]); return; }
      try {
        await loadGoogleMaps();
        const places = await (window as any).google.maps.importLibrary("places");
        sessionToken.current ||= new places.AutocompleteSessionToken();
        const result = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: value, includedRegionCodes: ["us"], language: "en-US", region: "us", sessionToken: sessionToken.current });
        setSuggestions((result.suggestions || []).map((item: any) => ({ text: item.placePrediction?.text?.toString() || "", prediction: item.placePrediction })).filter((item: { text: string }) => item.text).slice(0, 6));
      } catch (error) { console.error("Places autocomplete failed", error); setConfigured(false); setSuggestions([]); }
    }, value.trim().length < 2 ? 0 : 220);
    return () => window.clearTimeout(timer);
  }, [configured, value]);
  useEffect(() => {
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  async function choose(item: { text: string; prediction: any }) {
    onChange(item.text); setOpen(false); setSuggestions([]);
    try {
      const place = item.prediction.toPlace();
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      onCoordinates?.(place.location ? { lat: place.location.lat(), lng: place.location.lng() } : null);
      sessionToken.current = null;
    } catch (error) { console.error("Place details failed", error); onCoordinates?.(null); }
  }
  return <div ref={root} className={`relative ${className}`}><span className="flex min-h-11 items-center gap-2"><MapPin size={18} className="shrink-0 text-magenta"/><input name={name} value={value} onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); onCoordinates?.(null); setOpen(true); }} autoComplete="off" placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-xs outline-none sm:text-sm"/></span>{open && suggestions.length ? <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-plum/10 bg-white py-1 shadow-2xl">{suggestions.map((suggestion) => <button key={suggestion.text} type="button" onClick={() => void choose(suggestion)} className="block w-full px-4 py-3 text-left text-xs hover:bg-blush/40">{suggestion.text}</button>)}<p className="border-t border-plum/10 px-4 py-2 text-right text-[9px] text-ink/45">Suggestions by Google</p></div> : null}{!configured && value.length > 1 ? <p className="absolute top-full z-10 mt-1 text-[9px] text-ink/45">Location suggestions require Google Maps setup.</p> : null}</div>;
}
