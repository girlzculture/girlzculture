import Link from "next/link";
import { BadgeCheck, Check, Crown } from "lucide-react";
import { PLAN_ORDER, SUBSCRIPTION_PLANS } from "@/lib/plans";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";

export default function PlansPage() {
  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader />
    <section className="mx-auto w-full max-w-[1500px] px-5 py-12 sm:px-8 lg:px-14">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-amber">Plans for salon owners</p>
        <h1 className="mt-4 font-serif text-5xl font-semibold leading-none text-plum sm:text-6xl">Grow on your terms<span className="text-magenta">.</span></h1>
        <p className="mt-5 text-base leading-7 text-ink/65">Choose a plan during your application. You will not be charged until your salon is approved and you activate test-mode billing.</p>
      </div>
      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {PLAN_ORDER.map((name) => {
          const plan = SUBSCRIPTION_PLANS[name];
          const popular = name === "Growth";
          return <article key={name} className={`relative rounded-[20px] border bg-white/80 p-7 shadow-[0_18px_55px_rgba(26,18,32,.06)] ${popular ? "border-magenta ring-2 ring-magenta/10" : "border-plum/10"}`}>
            {popular ? <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-magenta px-4 py-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-white">Most Popular</span> : null}
            <span className="grid h-12 w-12 place-items-center rounded-full bg-blush text-plum">{name === "Premium" ? <Crown /> : <BadgeCheck />}</span>
            <h2 className="mt-5 font-serif text-3xl font-semibold text-plum">{name}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-ink/60">{plan.description}</p>
            <p className="mt-6 font-serif text-4xl font-semibold text-ink">${plan.monthlyPrice.toFixed(2)}<span className="font-sans text-xs font-normal text-ink/50"> / month</span></p>
            <ul className="mt-7 space-y-3 text-sm">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check size={17} className="mt-0.5 shrink-0 text-magenta" />{feature}</li>)}</ul>
            <Link href={`/salon/signup?plan=${name.toLowerCase()}`} className={`mt-8 flex min-h-12 items-center justify-center rounded-[9px] text-sm font-bold ${popular ? "bg-magenta text-white" : "border border-magenta text-magenta"}`}>Choose {name}</Link>
          </article>;
        })}
      </div>
      <div className="mt-10 rounded-[18px] bg-plum p-7 text-center text-white"><h2 className="font-serif text-3xl">No payment at application</h2><p className="mt-2 text-sm text-white/70">Apply first. After approval, activate your selected plan securely through Stripe test mode.</p></div>
    </section>
    <PublicFooter />
  </main>;
}
