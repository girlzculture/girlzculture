import Link from "next/link";
import { CalendarDays, CreditCard, Heart, Search, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import { PLAN_ORDER, SUBSCRIPTION_PLANS } from "@/lib/plans";

const benefits = [
  [UsersRound, "Reach More Clients", "Get discovered by thousands of clients actively looking."],
  [CalendarDays, "Fill Your Calendar", "Smart booking tools help you stay booked and in control."],
  [Search, "Get Discovered", "Show up in local search and trending styles."],
  [CreditCard, "Transparent Bookings", "Real-time availability and clear booking details."],
  [ShieldCheck, "Secure Deposits", "Protect your time with upfront deposits."],
  [Heart, "Build Your Brand", "Create your profile, showcase your work, and grow your name."],
] as const;

export default function PartnerPage() {
  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader />
    <section className="mx-auto grid w-full max-w-[1760px] items-center gap-8 px-5 py-10 md:grid-cols-[1fr_.9fr] lg:px-16">
      <div><p className="text-xs font-bold uppercase tracking-[.17em] text-amber">✦ For salon owners</p><h1 className="mt-4 max-w-3xl font-serif text-[48px] font-semibold leading-[.98] text-plum sm:text-[68px]">Grow Your Braiding Business with Girlz Culture</h1><p className="mt-5 max-w-xl text-lg leading-8 text-ink/70">Join the premium beauty booking marketplace that helps you get discovered, fill your calendar, and build a brand your clients love.</p><div className="mt-7 flex flex-wrap gap-4"><Link href="/plans" className="rounded-[9px] bg-magenta px-7 py-3.5 font-bold text-white">View Plans</Link><a href="#how" className="px-5 py-3.5 font-bold text-magenta">See How It Works →</a></div></div>
      <div className="relative min-h-[460px] overflow-hidden rounded-[28px] bg-blush"><div className="absolute inset-0 bg-[url('/images/hero-braids.jpg')] bg-cover bg-[center_30%]"/><div className="absolute bottom-5 left-5 right-5 grid grid-cols-3 rounded-[16px] bg-white/90 p-4 text-center backdrop-blur"><b>2,300+<small className="block font-normal">clients monthly</small></b><b>4.9★<small className="block font-normal">average rating</small></b><b>100%<small className="block font-normal">secure deposits</small></b></div></div>
    </section>
    <section className="mx-auto max-w-[1660px] px-5 py-9 lg:px-14"><h2 className="text-center font-serif text-3xl font-semibold text-plum">Why Salons Love Partnering With Us</h2><div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{benefits.map(([Icon,title,body])=><article key={title} className="rounded-[16px] bg-blush/35 p-5 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-plum"><Icon/></span><h3 className="mt-4 font-semibold text-plum">{title}</h3><p className="mt-2 text-xs leading-5 text-ink/65">{body}</p></article>)}</div></section>
    <section id="how" className="mx-auto grid max-w-[1550px] gap-8 px-5 py-10 lg:grid-cols-2"><div><h2 className="font-serif text-3xl font-semibold text-plum">How It Works For Salons</h2><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{["Apply","Get Approved","Activate Plan","Get Booked"].map((step,index)=><article key={step} className="rounded-[14px] border border-plum/10 bg-white p-4"><span className="grid h-7 w-7 place-items-center rounded-full bg-magenta text-xs font-bold text-white">{index+1}</span><h3 className="mt-4 font-semibold">{step}</h3></article>)}</div></div><div><div className="flex items-end justify-between"><h2 className="font-serif text-3xl font-semibold text-plum">Choose Your Plan</h2><Link href="/plans" className="text-sm font-bold text-magenta">Compare all →</Link></div><div className="mt-5 grid grid-cols-3 gap-3">{PLAN_ORDER.map((name)=><article key={name} className={`rounded-[14px] border p-5 text-center ${name==="Growth"?"border-magenta bg-blush/30":"border-plum/10 bg-white"}`}><Sparkles className="mx-auto text-amber"/><h3 className="mt-3 font-serif text-xl">{name}</h3><b className="mt-3 block text-2xl">${SUBSCRIPTION_PLANS[name].monthlyPrice.toFixed(2)}<small>/mo</small></b></article>)}</div></div></section>
    <section className="mx-auto mb-12 max-w-[1500px] rounded-[22px] bg-plum px-6 py-10 text-center text-white"><h2 className="font-serif text-4xl">Join thousands of successful salons.</h2><Link href="/plans" className="mt-6 inline-flex rounded-[9px] bg-magenta px-8 py-4 font-bold">Start Your Application</Link></section>
    <PublicFooter />
  </main>;
}
