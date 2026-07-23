"use client";

import Link from "next/link";
import { RotateCcw, SearchX } from "lucide-react";

export default function SalonDiscoveryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  void error;

  return (
    <section role="alert" className="mx-auto my-12 w-[calc(100%-2rem)] max-w-2xl rounded-[20px] border border-plum/10 bg-white p-8 text-center shadow-[0_14px_45px_rgba(26,18,32,.07)]">
      <SearchX className="mx-auto text-magenta" size={38} aria-hidden="true" />
      <h1 className="mt-4 font-serif text-3xl text-plum">Nearby salons could not be loaded.</h1>
      <p className="mt-2 text-sm leading-6 text-ink/65">Try the search again. You can also browse styles while this section reconnects.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-5 text-sm font-bold text-white"><RotateCcw size={16} aria-hidden="true" />Retry search</button>
        <Link href="/styles" className="inline-flex min-h-11 items-center rounded-lg border border-magenta px-5 text-sm font-bold text-magenta">Browse styles</Link>
      </div>
    </section>
  );
}
