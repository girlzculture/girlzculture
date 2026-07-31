"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { StyleAutocomplete } from "@/components/search/AutocompleteInputs";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";

export default function HeaderStyleSearch() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const customerLocation = useCustomerLocation();

  function destination(style?: string | null) {
    const params = new URLSearchParams();
    const interpreted = style?.trim() || query.trim();
    if (interpreted) params.set("style", interpreted);
    if (customerLocation.location) {
      params.set("lat", String(customerLocation.location.lat));
      params.set("lng", String(customerLocation.location.lng));
      params.set("location", customerLocation.location.label);
    }
    return params.size ? `/salons?${params}` : "/salons";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (query.trim().length < 3) {
      router.push(destination());
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/concierge/search", {
        method: "POST",
        credentials: "same-origin",
        redirect: "manual",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Requested-With": "girlz-culture-header-search",
        },
        body: JSON.stringify({
          prompt: query.trim(),
          latitude: customerLocation.location?.lat,
          longitude: customerLocation.location?.lng,
          website: "",
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && contentType.toLowerCase().includes("application/json")) {
        const body = await response.json() as { intent?: { style?: string | null } };
        router.push(destination(body.intent?.style));
        return;
      }
    } catch {
      // Keep the ordinary catalog search available whenever assisted
      // interpretation is unavailable.
    } finally {
      setBusy(false);
    }
    router.push(destination());
  }

  return <form onSubmit={submit} aria-busy={busy} className="w-[138px] rounded-xl border border-plum/10 bg-white/75 px-2 min-[390px]:w-[168px] md:w-[230px] lg:w-[270px] xl:hidden"><StyleAutocomplete value={query} onChange={setQuery} placeholder="Search" className="[&_span]:min-h-10 [&_svg]:h-4 [&_svg]:w-4"/></form>;
}
