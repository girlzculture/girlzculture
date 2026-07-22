import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { CustomerBottomNav, PublicHeader } from "@/components/site/PublicChrome";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0">
      <PublicHeader />
      <section className="mx-auto grid min-h-[70vh] w-full max-w-3xl place-items-center px-4 py-16 text-center sm:px-6">
        <div className="w-full rounded-[24px] border border-plum/10 bg-white p-8 shadow-[0_18px_55px_rgba(26,18,32,.08)] sm:p-12">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-blush/60 text-magenta"><Sparkles aria-hidden="true" size={26} /></span>
          <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-magenta">Page not found</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-plum sm:text-5xl">This page is not available.</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-ink/65">The link may have changed, or this salon may not be published yet. Browse available salons to keep looking.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/salons" className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-magenta px-5 text-sm font-bold text-white"><Search aria-hidden="true" size={17} />Find salons</Link>
            <Link href="/" className="inline-flex min-h-11 items-center rounded-[10px] border border-magenta px-5 text-sm font-bold text-magenta">Return home</Link>
          </div>
        </div>
      </section>
      <CustomerBottomNav active="search" />
    </main>
  );
}
