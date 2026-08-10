"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed } from "lucide-react";
import { LocationAutocomplete, StyleAutocomplete } from "@/components/search/AutocompleteInputs";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import type { CustomerLocation } from "@/lib/location";

export default function SearchComposer({ compact = false }: { compact?: boolean }) {
  const [style, setStyle] = useState("");
  const [locationText, setLocationText] = useState("");
  const [resolved, setResolved] = useState<CustomerLocation | null>(null);
  const [editingLocation, setEditingLocation] = useState(false);
  const customerLocation = useCustomerLocation();
  const router = useRouter();
  const effectiveLocation = resolved || (!editingLocation ? customerLocation.location : null);

  function beginLocationEdit(value: string) {
    setEditingLocation(true);
    setLocationText(value);
    setResolved(null);
  }
  function resolve(next: CustomerLocation | null) {
    setResolved(next);
    setEditingLocation(!next);
    if (next) {
      setLocationText("");
      customerLocation.setLocation(next);
    }
  }
  function changeConfirmedLocation() {
    setResolved(null);
    setEditingLocation(true);
    setLocationText("");
  }
  async function requestDeviceLocation() {
    setResolved(null);
    setEditingLocation(false);
    setLocationText("");
    await customerLocation.useDeviceLocation();
  }
  function destination() {
    const selectedLocation = effectiveLocation;
    const query = new URLSearchParams();
    const customerQuery = style.trim();
    // Preserve every customer constraint for the shared deterministic search.
    // Replacing the query with one AI-extracted style used to discard budget,
    // date, rating, promotion, and distance language.
    if (customerQuery) query.set("q", customerQuery);
    if (selectedLocation) {
      query.set("lat", String(selectedLocation.lat));
      query.set("lng", String(selectedLocation.lng));
      query.set("location", selectedLocation.label);
    }
    return query.size ? `/salons?${query}` : "/salons";
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(destination());
  }

  const locationPlaceholder = effectiveLocation?.source === "device"
    ? "Current location"
    : effectiveLocation
      ? "Choose a different location"
      : "City, neighborhood, or ZIP";

  return <form onSubmit={submit} className={`relative z-[70] overflow-visible border border-plum/10 bg-white shadow-[0_12px_34px_rgba(13,17,20,.10)] ${compact ? "rounded-[14px] p-2.5" : "rounded-[16px] p-2.5 sm:p-3 md:p-1.5"}`}>
    <div className="grid gap-2 md:grid-cols-[1.15fr_1fr_auto] md:items-stretch">
      <label className="block min-w-0 rounded-[10px] px-3 py-1 focus-within:bg-cream/55"><span className="block text-[10px] font-bold text-ink">What service are you looking for?</span><StyleAutocomplete value={style} onChange={setStyle} onLocation={resolve} placeholder="e.g., Knotless Braids" className="mt-0.5"/></label>
      <div className="block min-w-0 border-t border-plum/10 px-3 py-1 focus-within:bg-cream/55 md:border-l md:border-t-0">
        <span className="flex min-h-4 items-center justify-between gap-2 text-[10px] font-bold text-ink">
          <span>Where?</span>
          {effectiveLocation ? <button type="button" onClick={changeConfirmedLocation} className="max-w-[70%] truncate text-magenta" title={effectiveLocation.label}>{effectiveLocation.label} · Change</button> : null}
        </span>
        <LocationAutocomplete name="location_query" value={locationText} onChange={beginLocationEdit} onResolved={resolve} placeholder={locationPlaceholder} className="mt-0.5"/>
        <button type="button" onClick={() => void requestDeviceLocation()} className="mt-1 inline-flex min-h-8 items-center gap-1.5 text-[10px] font-bold text-magenta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"><LocateFixed size={13}/>Use my location</button>
        {customerLocation.permissionError ? <p role="alert" className="mt-1 text-[10px] text-red-700">{customerLocation.permissionError}</p> : null}
      </div>
      <button type="submit" className="min-h-11 rounded-[10px] bg-magenta px-8 text-[13px] font-bold text-white shadow-[0_8px_20px_rgba(0,131,166,.18)] transition hover:-translate-y-0.5 hover:bg-primary-hover">Search</button>
    </div>
  </form>;
}
