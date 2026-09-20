"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, X } from "lucide-react";

export default function WorkspaceToolbar({ homeHref, homeLabel, current, destinations, compact = false }: {
  homeHref: string; homeLabel: string; current: string;
  destinations: { label: string; href: string }[];
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = query.trim() ? destinations.filter(item => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];
  return <div className={compact ? "w-full min-w-0" : "gc-workspace-toolbar"}>
    {!compact ? <nav aria-label="Workspace breadcrumbs" className="flex min-w-0 items-center gap-2 text-sm">
      <Link href={homeHref} className="inline-flex min-h-10 items-center gap-2 font-semibold text-text-link"><ArrowLeft size={16} aria-hidden/>{homeLabel}</Link>
      {current !== homeLabel ? <><span aria-hidden>/</span><span aria-current="page">{current}</span></> : null}
    </nav> : null}
    <div className={`relative w-full ${compact ? "" : "sm:w-64"}`}>
      <label className="flex items-center gap-2 rounded-lg border border-border bg-white px-3"><Search size={16} aria-hidden/><input aria-label="Find a dashboard page" placeholder="Find a dashboard page" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setQuery(""); }} className="h-10 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"/>{query ? <button onClick={() => setQuery("")} aria-label="Clear page search"><X size={16}/></button> : null}</label>
      {query.trim() ? <div className="absolute right-0 top-full z-40 mt-2 w-full rounded-xl border border-border bg-white p-2 shadow-lg" aria-label="Matching dashboard pages">{matches.length ? matches.map(item => <Link key={item.href} href={item.href} onClick={() => setQuery("")} className="block rounded-lg p-3 text-sm font-semibold hover:bg-subtle">{item.label}</Link>) : <p className="p-3 text-sm">No matching page.</p>}</div> : null}
    </div>
  </div>;
}
