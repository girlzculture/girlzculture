import Link from "next/link";
import { BadgeCheck, Check, Crown } from "lucide-react";
import {
  PLAN_COMPARISON_ROWS,
  PLAN_ORDER,
  SUBSCRIPTION_PLANS,
  type PlanComparisonValue,
} from "@/lib/plans";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";

function ComparisonValue({ value }: { value: PlanComparisonValue }) {
  if (value === true) {
    return <span className="inline-flex items-center gap-1.5 font-semibold"><Check aria-hidden="true" size={16} className="text-magenta"/><span className="sr-only">Included</span></span>;
  }
  return <span>{value}</span>;
}

export default function PlansPage() {
  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader />
    <section className="mx-auto w-full max-w-[1600px] px-4 py-10 sm:px-8 sm:py-12 lg:px-14">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-amber">Plans for salon owners</p>
        <h1 className="mt-4 font-serif text-5xl font-semibold leading-none text-plum sm:text-6xl">Grow on your terms<span className="text-magenta">.</span></h1>
        <p className="mt-5 text-base leading-7 text-ink/65">Choose a plan during your application. You will not be charged until your salon is approved and you subscribe</p>
      </div>

      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {PLAN_ORDER.map((name) => {
          const plan = SUBSCRIPTION_PLANS[name];
          const popular = name === "Growth";
          return <article key={name} className={`relative flex h-full flex-col rounded-[20px] border bg-white/80 p-7 shadow-[0_18px_55px_rgba(13,17,20,.06)] ${popular ? "border-magenta ring-2 ring-magenta/10" : "border-plum/10"}`}>
            {popular ? <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-magenta px-4 py-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-white">Most Popular</span> : null}
            <span className="grid h-12 w-12 place-items-center rounded-full bg-blush text-plum">{name === "Premium" ? <Crown aria-hidden="true" /> : <BadgeCheck aria-hidden="true" />}</span>
            <h2 className="mt-5 font-serif text-3xl font-semibold text-plum">{name}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 gc-text-secondary">{plan.description}</p>
            <p className="mt-6 font-serif text-4xl font-semibold text-ink">${plan.monthlyPrice}<span className="font-sans text-xs font-normal text-ink/50"> / month</span></p>
            <ul className="mt-7 flex-1 space-y-3 text-sm">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-magenta" />{feature}</li>)}</ul>
            <Link href={`/salon/signup?plan=${plan.key}`} className={`mt-8 flex min-h-12 items-center justify-center rounded-[9px] text-sm font-bold ${popular ? "bg-magenta text-white" : "border border-magenta text-magenta"}`}>Choose {name}</Link>
          </article>;
        })}
      </div>

      <section className="mt-12" aria-labelledby="compare-plans-heading">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-amber">Full comparison</p>
          <h2 id="compare-plans-heading" className="mt-3 font-serif text-4xl font-semibold text-plum">Compare every plan benefit<span className="text-magenta">.</span></h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 gc-text-secondary">Every salon receives the same standard marketplace visibility. Advertising benefits are separate from organic search results.</p>
        </div>
        <p className="mt-6 text-center text-[11px] font-semibold gc-text-muted md:hidden">Swipe left and right to compare all three plans.</p>
        <div className="mt-4 overflow-x-auto rounded-[20px] border border-plum/10 bg-white/85 shadow-[0_18px_55px_rgba(13,17,20,.05)] [contain:layout_paint]" tabIndex={0} aria-label="Scrollable plan comparison">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <caption className="sr-only">Starter, Growth, and Premium salon subscription feature comparison</caption>
            <thead>
              <tr className="border-b border-plum/10 bg-blush/25">
                <th scope="col" className="sticky left-0 z-20 w-[34%] min-w-64 bg-cream px-5 py-5 font-semibold text-plum">Feature</th>
                {PLAN_ORDER.map((name) => <th key={name} scope="col" className="min-w-40 px-5 py-5 text-center">
                  <span className="block font-serif text-xl font-semibold text-plum">{name}</span>
                  <span className="mt-1 block text-xs font-normal gc-text-muted">${SUBSCRIPTION_PLANS[name].monthlyPrice}/month</span>
                </th>)}
              </tr>
            </thead>
            <tbody>
              {PLAN_COMPARISON_ROWS.map((row, index) => <tr key={row.key} className={`border-b border-plum/10 last:border-0 ${index % 2 ? "bg-blush/10" : "bg-white/40"}`}>
                <th scope="row" className={`sticky left-0 z-10 px-5 py-4 text-[13px] font-semibold leading-5 text-ink ${index % 2 ? "bg-cream" : "bg-white"}`}>{row.label}</th>
                {PLAN_ORDER.map((name) => <td key={name} className="px-5 py-4 text-center text-[13px] leading-5 text-ink/75"><ComparisonValue value={row.values[name]}/></td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10 rounded-[18px] bg-plum p-7 text-center text-white">
        <h2 className="font-serif text-3xl">No payment at application</h2>
        <p className="mt-2 text-sm gc-text-on-dark-muted">Apply first. After approval, activate your selected plan securely through subscriptions</p>
      </div>
    </section>
    <PublicFooter />
  </main>;
}
