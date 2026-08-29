"use client";

import { type FormEvent, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";

export default function HeaderStyleSearch() {
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const customerLocation = useCustomerLocation();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const value = query.trim();
    if (value) params.set("q", value);
    if (customerLocation.location) {
      params.set("lat", String(customerLocation.location.lat));
      params.set("lng", String(customerLocation.location.lng));
      params.set("location", customerLocation.location.label);
    }
    router.push(params.size ? `/salons?${params.toString()}` : "/salons");
  }

  if (pathname === "/salons") return null;

  return (
    <form
      role="search"
      onSubmit={submit}
      data-public-header-control="search"
      className="w-full min-w-0 max-w-[154px] overflow-hidden rounded-[10px] border border-plum/15 bg-white px-2 min-[390px]:max-w-[184px] md:max-w-[250px] lg:max-w-[310px] xl:max-w-[350px] 2xl:max-w-[260px] min-[1700px]:max-w-[350px]"
    >
      <label className="flex min-h-10 min-w-0 items-center gap-1 min-[390px]:gap-2">
        <span className="sr-only">Search</span>
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          maxLength={600}
          autoComplete="off"
          enterKeyHint="search"
          className="gc-placeholder-light min-w-0 flex-1 bg-transparent px-1 text-[12px] font-semibold text-ink outline-none"
        />
        <button
          type="submit"
          className="min-h-8 shrink-0 rounded-[7px] bg-magenta px-2 text-[9px] font-bold text-white min-[390px]:px-2.5"
        >
          Search
        </button>
      </label>
    </form>
  );
}
