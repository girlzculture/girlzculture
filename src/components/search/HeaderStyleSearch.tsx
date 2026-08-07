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
      params.set(
        "lat",
        String(customerLocation.location.lat),
      );
      params.set(
        "lng",
        String(customerLocation.location.lng),
      );
      params.set(
        "location",
        customerLocation.location.label,
      );
    }
    router.push(
      params.size
        ? `/salons?${params.toString()}`
        : "/salons",
    );
  }

  // Find Salons owns the one unified search field on that route. Keeping the
  // global header search there would recreate the duplicate-search problem and
  // can force the mobile header wider than the viewport at increased text size.
  if (pathname === "/salons") return null;

  return (
    <form
      onSubmit={submit}
      className="w-[154px] rounded-[10px] border border-plum/15 bg-white px-2 min-[390px]:w-[184px] md:w-[250px] lg:w-[310px] xl:w-[350px]"
    >
      <label className="flex min-h-10 items-center gap-2">
        <span className="sr-only">Search</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          maxLength={600}
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent px-1 text-[12px] font-semibold text-ink outline-none placeholder:text-ink/50"
        />
        <button
          type="submit"
          className="min-h-8 rounded-[7px] bg-magenta px-2.5 text-[9px] font-bold text-white"
        >
          Search
        </button>
      </label>
    </form>
  );
}
