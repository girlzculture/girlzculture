import { BadgeCheck, CalendarClock, CreditCard, Search, ShieldCheck, Star, Tags, UserRoundCheck } from "lucide-react";
import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import { getContentPage } from "@/lib/content";

const steps = [
  { title: "Find a style or salon", text: "Search or browse services and salons near you.", icon: Search },
  { title: "Compare prices & reviews", text: "See transparent pricing and verified reviews before you book.", icon: Star },
  { title: "Pick your stylist & time", text: "Choose your stylist and an available appointment slot.", icon: CalendarClock },
  { title: "Book with a small deposit", text: "Pay a 10% reservation deposit to secure your appointment. The balance is paid at the salon.", icon: CreditCard },
  { title: "Get Your Appointment Confirmed", text: "Receive confirmation instantly, then arrive ready for your service.", icon: BadgeCheck },
];
const benefits = [
  { title: "Verified Salons", text: "Every salon is identity-verified and reviewed for quality and professionalism.", icon: ShieldCheck },
  { title: "Transparent Pricing", text: "Upfront pricing with no surprises. Know exactly what you will pay before you book.", icon: Tags },
  { title: "Booking-based Reviews", text: "Read reviews connected to completed appointments before you book.", icon: UserRoundCheck },
];
const fallbackFaqs = [
  { title: "How much is the deposit?", body: "We require a 10% reservation deposit to secure your appointment. The remaining balance is paid directly at the salon after your service." },
  { title: "When do I pay the balance?", body: "You pay the remaining balance directly to the salon after your appointment." },
  { title: "Are salons vetted?", body: "Yes. Salons are reviewed for identity, licensing, safety, and professional standards." },
  { title: "Can I reschedule my appointment?", body: "Yes, subject to the salon's cancellation and rescheduling policy." },
];

export default async function HowItWorksPage() {
  const content = await getContentPage("how-it-works", { slug: "how-it-works", title: "How It Works", hero_title: "Book with clear steps and real confirmation.", hero_subtitle: "Find, compare, book, and receive confirmation without guesswork.", sections: fallbackFaqs });
  const faqs = content.sections?.filter((section) => section.title && section.body) || fallbackFaqs;
  return <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0"><PublicHeader active="how"/><section className="border-b border-plum/10"><div className="mx-auto w-full max-w-[1760px] px-4 py-5 sm:px-8 lg:px-12 lg:py-8 2xl:px-16"><p className="text-xs font-bold uppercase tracking-[.17em] text-magenta">How booking works</p><h1 className="mt-2 max-w-[760px] font-serif text-[32px] font-semibold leading-[.98] tracking-[-0.035em] text-plum sm:text-[44px]">{content.hero_title}</h1><p className="mt-3 max-w-[650px] text-sm leading-6 text-ink/65">{content.hero_subtitle}</p></div></section>
    <section className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-8 lg:px-12 2xl:px-16"><div className="grid gap-2 md:grid-cols-5">{steps.map((step,index) => { const Icon=step.icon; return <article key={step.title} className="relative rounded-[12px] border border-plum/10 bg-white/75 p-3 shadow-[0_6px_20px_rgba(26,18,32,.04)] md:min-h-[225px] md:p-5"><span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-plum text-xs font-bold text-white">{index+1}</span><Icon className="ml-10 text-amber md:mx-auto md:mt-4" size={34}/><h2 className="mt-2 font-serif text-lg font-semibold leading-tight md:mt-5 md:text-center">{step.title}</h2><p className="mt-1 text-xs leading-5 text-ink/70 md:text-center">{step.text}</p></article>; })}</div>
      <div className="mt-3 grid gap-3 rounded-[12px] bg-blush/45 p-4 md:grid-cols-3">{benefits.map((benefit)=>{const Icon=benefit.icon;return <div key={benefit.title} className="flex items-center gap-3 md:px-6"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber bg-white text-amber"><Icon size={22}/></span><span><b className="font-serif text-base">{benefit.title}</b><span className="mt-1 block text-[10px] leading-4 text-ink/70">{benefit.text}</span></span></div>;})}</div>
      <section className="mt-5 grid gap-3 md:grid-cols-[260px_1fr]"><h2 className="font-serif text-[27px] font-semibold leading-none">Frequently<br/>Asked Questions</h2><div className="space-y-2">{faqs.map((faq,index)=><details key={`${faq.title}-${index}`} open={index===0} className="group rounded-[10px] border border-plum/10 bg-white/75 px-4 py-3"><summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold [&::-webkit-details-marker]:hidden"><span>{faq.title}</span><span className="text-magenta group-open:rotate-45">+</span></summary><p className="mt-2 text-[11px] leading-5 text-ink/70">{faq.body}</p></details>)}</div></section>
    </section><PublicFooter/><CustomerBottomNav active="home"/></main>;
}
