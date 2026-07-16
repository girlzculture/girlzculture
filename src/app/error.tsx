"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Girlz Culture route error", { digest: error.digest, error });
  }, [error]);

  return (
    <main className="grid min-h-[70vh] place-items-center bg-cream px-4 py-16 text-center text-ink">
      <section className="w-full max-w-xl rounded-[22px] border border-plum/10 bg-white p-8 shadow-[0_16px_50px_rgba(26,18,32,.08)]">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-blush text-magenta"><AlertTriangle aria-hidden="true" /></span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[.14em] text-magenta">Something went wrong</p>
        <h1 className="mt-2 font-serif text-4xl text-plum">This page needs another moment.</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink/65">Your information is safe. Try loading this section again, or return home and continue browsing.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-5 text-sm font-bold text-white"><RotateCcw size={16} aria-hidden="true" />Try again</button>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-lg border border-magenta px-5 text-sm font-bold text-magenta">Return home</Link>
        </div>
      </section>
    </main>
  );
}
