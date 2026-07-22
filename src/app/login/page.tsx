import Link from "next/link";
import { CalendarDays, Crown, Heart, Star } from "lucide-react";
import CustomerAuth from "@/components/CustomerAuth";
import { Wordmark } from "@/components/site/PublicChrome";
import LanguageSelector from "@/components/i18n/LanguageSelector";

export default function CustomerLogin() {
  const benefits = [[Heart, "Save your favorite stylists"], [CalendarDays, "See your bookings"], [Star, "Leave reviews"]] as const;
  return <main className="min-h-screen bg-cream p-4 text-ink">
    <header className="mx-auto flex max-w-[1500px] items-center justify-between py-4"><Wordmark/><div data-language-selector-host className="flex items-center gap-5"><nav className="hidden gap-8 text-sm font-semibold md:flex"><Link href="/salons">Find Salons</Link><Link href="/styles">Services</Link><Link href="/partner">For Stylists</Link><Link href="/how-it-works">How It Works</Link></nav><LanguageSelector compact/></div></header>
    <div className="mx-auto grid max-w-[1400px] items-stretch overflow-hidden rounded-[22px] border border-plum/10 bg-white/80 shadow-xl lg:grid-cols-[1fr_.8fr]">
      <section className="relative hidden min-h-[680px] overflow-hidden bg-[url('/images/hero-braids.jpg')] bg-cover bg-center lg:block">
        <div className="absolute inset-0 bg-gradient-to-r from-cream via-cream/30 to-transparent"/>
        <div className="absolute left-12 top-16 max-w-sm">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-amber"><Crown size={17} aria-hidden="true"/>Premium beauty booking marketplace</p>
          <h1 className="mt-5 font-serif text-6xl font-semibold leading-none text-plum">Your beauty.<br/>Your way.</h1>
          <p className="mt-5 text-lg leading-7">Book trusted beauty professionals on your schedule, anytime and anywhere.</p>
          <ul className="mt-8 space-y-5">{benefits.map(([Icon, label]) => <li key={label} className="flex items-center gap-4 font-semibold"><span className="grid h-12 w-12 place-items-center rounded-[12px] bg-blush text-magenta"><Icon/></span>{label}</li>)}</ul>
        </div>
      </section>
      <section className="m-auto w-full max-w-xl p-4 sm:p-8"><div className="mb-5 text-center lg:hidden"><Wordmark/><h1 className="mt-6 font-serif text-4xl font-semibold text-plum">Your beauty. Your way.</h1></div><div className="overflow-hidden rounded-[18px] border border-plum/10 bg-white shadow-sm"><CustomerAuth/></div></section>
    </div>
  </main>;
}
