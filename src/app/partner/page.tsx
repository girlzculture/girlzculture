import Link from "next/link";
import { CalendarDays, CreditCard, Heart, Search, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import { PLAN_ORDER, SUBSCRIPTION_PLANS } from "@/lib/plans";

const benefits = [
  [UsersRound, "Reach More Clients", "Help nearby clients discover your salon."],
  [CalendarDays, "Fill Your Calendar", "Smart booking tools help you stay booked and in control."],
  [Search, "Get Discovered", "Show up in local search and relevant style results."],
  [CreditCard, "Transparent Bookings", "Real-time availability and clear booking details."],
  [ShieldCheck, "Secure Deposits", "Protect your time with upfront deposits."],
  [Heart, "Build Your Brand", "Create your profile, showcase your work, and grow your name."],
] as const;

export default function PartnerPage() {
  return <main className="min-h-screen overflow-x-hidden bg-cream text-ink">
    <PublicHeader />
    <section className="mx-auto grid w-full max-w-[1760px] items-center gap-8 overflow-hidden px-5 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,.9fr)] md:py-10 lg:px-16">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.17em] text-amber">For salon owners</p><h1 className="mt-4 max-w-3xl font-serif text-[clamp(2.75rem,8.5vw,4.25rem)] font-semibold leading-[.98] text-plum">Grow Your Braiding Business with Girlz Culture</h1><p className="mt-5 max-w-xl text-base leading-7 text-ink/70 sm:text-lg sm:leading-8">Join a beauty booking marketplace designed to help clients discover your salon, understand your services, and request appointments.</p><div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4"><Link href="/plans" className="rounded-[9px] bg-magenta px-7 py-3.5 text-center font-bold text-white">View Plans</Link><a href="#how" className="px-5 py-3.5 text-center font-bold text-magenta">See How It Works</a></div></div>
      <div className="relative min-h-[340px] min-w-0 overflow-hidden rounded-[22px] bg-blush sm:min-h-[460px] sm:rounded-[28px]"><div className="absolute inset-0 bg-[url('/images/hero-braids.jpg')] bg-cover bg-[center_30%]"/></div>
    </section>
    <section className="mx-auto max-w-[1660px] px-5 py-9 lg:px-14"><h2 className="text-center font-serif text-3xl font-semibold text-plum">Why Salons Partner With Us</h2><div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{benefits.map(([Icon,title,body])=><article key={title} className="min-w-0 rounded-[16px] bg-blush/35 p-4 text-center sm:p-5"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-plum"><Icon/></span><h3 className="mt-4 break-words font-semibold text-plum">{title}</h3><p className="mt-2 text-xs leading-5 text-ink/65">{body}</p></article>)}</div></section>
    <section id="how" className="mx-auto grid max-w-[1550px] min-w-0 gap-8 overflow-hidden px-5 py-10 lg:grid-cols-2"><div className="min-w-0"><h2 className="font-serif text-3xl font-semibold text-plum">How It Works For Salons</h2><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{["Apply","Get Approved","Activate Plan","Get Booked"].map((step,index)=><article key={step} className="min-w-0 rounded-[14px] border border-plum/10 bg-white p-4"><span className="grid h-7 w-7 place-items-center rounded-full bg-magenta text-xs font-bold text-white">{index+1}</span><h3 className="mt-4 break-words font-semibold">{step}</h3></article>)}</div></div><div className="min-w-0"><div className="flex flex-wrap items-end justify-between gap-3"><h2 className="font-serif text-3xl font-semibold text-plum">Choose Your Plan</h2><Link href="/plans" className="text-sm font-bold text-magenta">Compare all</Link></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{PLAN_ORDER.map((name)=><article key={name} className={`min-w-0 rounded-[14px] border p-5 text-center ${name==="Growth"?"border-magenta bg-blush/30":"border-plum/10 bg-white"}`}><Sparkles className="mx-auto text-amber"/><h3 className="mt-3 font-serif text-xl">{name}</h3><b className="mt-3 block break-words text-2xl">${SUBSCRIPTION_PLANS[name].monthlyPrice.toFixed(2)}<small className="text-xs">/mo</small></b></article>)}</div></div></section>
    <section className="mx-5 mb-12 max-w-[1500px] rounded-[22px] bg-plum px-6 py-10 text-center text-white min-[1540px]:mx-auto"><h2 className="font-serif text-3xl sm:text-4xl">Build your salon presence with Girlz Culture.</h2><Link href="/plans" className="mt-6 inline-flex rounded-[9px] bg-magenta px-8 py-4 font-bold">Start Your Application</Link></section>
    <PublicFooter />
  </main>;
}
