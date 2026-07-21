"use client";

import { useMemo, useState } from "react";
import { LocateFixed, MapPin, X } from "lucide-react";
import { LocationAutocomplete, StyleAutocomplete } from "@/components/search/AutocompleteInputs";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import type { CustomerLocation } from "@/lib/location";

export default function SearchComposer({ compact = false }: { compact?: boolean }) {
  const [style, setStyle] = useState("");
  const [locationText, setLocationText] = useState("");
  const [resolved, setResolved] = useState<CustomerLocation | null>(null);
  const [editingLocation, setEditingLocation] = useState(false);
  const customerLocation = useCustomerLocation();
  const effectiveLocation = resolved || (!editingLocation ? customerLocation.location : null);
  const contextQuery = useMemo(() => {
    const query = new URLSearchParams();
    if (effectiveLocation) {
      query.set("location", effectiveLocation.label);
      query.set("lat", String(effectiveLocation.lat));
      query.set("lng", String(effectiveLocation.lng));
    }
    return query.toString();
  }, [effectiveLocation]);

  function beginLocationEdit(value: string) {
    setEditingLocation(true);
    setLocationText(value);
    setResolved(null);
    customerLocation.clearLocation();
  }
  function resolve(next: CustomerLocation | null) {
    setResolved(next);
    setEditingLocation(!next);
    if (next) {
      setLocationText("");
      customerLocation.setLocation(next);
    }
  }
  function clearConfirmedLocation() {
    setResolved(null);
    setEditingLocation(true);
    setLocationText("");
    customerLocation.clearLocation();
  }
  async function requestDeviceLocation() {
    setResolved(null);
    setEditingLocation(false);
    setLocationText("");
    customerLocation.clearLocation();
    await customerLocation.useDeviceLocation();
  }

  const locationPlaceholder = effectiveLocation?.source === "device"
    ? "Current location"
    : effectiveLocation
      ? "Choose a different location"
      : "City, neighborhood, or ZIP";

  return <form action="/salons" method="get" className={`border border-plum/10 bg-[#fffdfa] shadow-[0_12px_34px_rgba(26,18,32,.10)] ${compact ? "rounded-[14px] p-2.5" : "rounded-[16px] p-2.5 sm:p-3 md:p-1.5"}`}>
    <input type="hidden" name="location" value={effectiveLocation?.label || ""}/>
    <input type="hidden" name="lat" value={effectiveLocation?.lat ?? ""}/>
    <input type="hidden" name="lng" value={effectiveLocation?.lng ?? ""}/>
    <div className="grid gap-2 md:grid-cols-[1.1fr_.9fr_auto] md:items-end">
      <label className="block min-w-0 rounded-[10px] px-3 py-1 focus-within:bg-cream/55"><span className="block text-[10px] font-bold text-ink">What service are you looking for?</span><StyleAutocomplete value={style} onChange={setStyle} onLocation={resolve} contextQuery={contextQuery} placeholder="e.g., Knotless Braids" className="mt-0.5"/></label>
      <div className="block min-w-0 border-t border-plum/10 px-3 py-1 focus-within:bg-cream/55 md:border-l md:border-t-0"><span className="block text-[10px] font-bold text-ink">Where?</span><LocationAutocomplete name="location_query" value={locationText} onChange={beginLocationEdit} onResolved={resolve} placeholder={locationPlaceholder} className="mt-0.5"/><button type="button" onClick={() => void requestDeviceLocation()} className="mt-1 inline-flex min-h-8 items-center gap-1.5 text-[10px] font-bold text-magenta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"><LocateFixed size={13}/>Use my location</button>{customerLocation.permissionError ? <p role="alert" className="mt-1 text-[10px] text-red-700">{customerLocation.permissionError}</p> : null}</div>
      <button type="submit" className="min-h-11 rounded-[10px] bg-magenta px-8 text-[13px] font-bold text-white shadow-[0_8px_20px_rgba(214,24,107,.18)] transition hover:-translate-y-0.5 hover:bg-[#bb145d]">Search</button>
    </div>
    {effectiveLocation ? <div className="mt-2 flex items-center gap-2 px-3 text-[10px] text-ink/60"><MapPin size={12} className="text-magenta"/><span>Near <b className="text-plum">{effectiveLocation.label}</b></span><button type="button" onClick={clearConfirmedLocation} className="inline-flex min-h-8 items-center gap-1 font-bold text-magenta">Change <X size={11}/></button></div> : null}
  </form>;
}
