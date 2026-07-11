import Link from "next/link";
import { CalendarClock, CreditCard, Search, ShieldCheck, Sparkles, Star, Tags, UserRoundCheck } from "lucide-react";
import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";

const steps = [
  { title: "Find a style or salon", text: "Search or browse styles and salons near you.", icon: Search },
  { title: "Compare real prices & reviews", text: "See transparent pricing and verified reviews before you book.", icon: Star },
  { title: "Pick your stylist & time", text: "Choose your stylist and an available appointment slot.", icon: CalendarClock },
  { title: "Book with a small deposit", text: "Pay a 10% reservation deposit to secure your appointment. The balance is paid at the salon.", icon: CreditCard },
  { title: "Show up & slay", text: "Go to your appointment, enjoy your service, then leave a review.", icon: Sparkles },
];
const benefits = [
  { title: "Verified Salons", text: "Every salon is identity-verified and reviewed for quality and professionalism.", icon: ShieldCheck },
  { title: "Transparent Pricing", text: "Upfront pricing with no surprises. Know exactly what you’ll pay before you book.", icon: Tags },
  { title: "Real Reviews", text: "Read honest reviews from real clients and see real results before you book.", icon: UserRoundCheck },
];
const faqs = [
  ["How much is the deposit?", "We require a 10% reservation deposit to secure your appointment. The remaining balance is paid directly at the salon after your service."],
  ["When do I pay the balance?", "You pay the remaining balance directly to the salon after your appointment."],
  ["Are salons vetted?", "Yes. Salons are reviewed for identity, licensing, safety, and professional standards."],
  ["Can I reschedule my appointment?", "Yes, subject to the salon’s cancellation and rescheduling policy."],
];

export default function HowItWorksPage() {
  return <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0"><PublicHeader active="how" />
    <section className="relative overflow-hidden border-b border-plum/10"><div className="absolute right-0 top-0 hidden h-full w-1/2 bg-[radial-gradient(circle_at_center,rgba(224,163,78,0.23),transparent_60%)] md:block" /><div className="relative mx-auto w-full max-w-[1760px] px-4 py-8 sm:px-8 lg:px-12 lg:py-12 2xl:px-16"><h1 className="max-w-[720px] font-serif text-[44px] font-semibold leading-[0.94] tracking-[-0.045em] text-ink sm:text-[60px]">How Girlz Culture<br />Works<span className="text-magenta">.</span></h1><p className="mt-4 max-w-[600px] text-sm leading-6 sm:text-lg">We make beauty booking easier, clearer, and more trustworthy—so you can book with confidence and love your experience.</p></div></section>
    <section className="mx-auto w-full max-w-[1760px] px-4 py-5 sm:px-8 lg:px-12 2xl:px-16"><div className="grid gap-3 md:grid-cols-5">{steps.map((step, index) => { const Icon=step.icon; return <article key={step.title} className="relative rounded-[12px] border border-plum/10 bg-white/75 p-4 shadow-[0_6px_20px_rgba(26,18,32,0.04)] md:min-h-[250px] md:p-6"><span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-plum text-xs font-bold text-white">{index+1}</span><Icon className="ml-10 text-amber md:mx-auto md:mt-4" size={38} strokeWidth={1.6} /><h2 className="mt-3 font-serif text-xl font-semibold leading-tight text-ink md:mt-6 md:text-center">{step.title}</h2><p className="mt-2 text-xs leading-5 text-ink/70 md:text-center">{step.text}</p></article>; })}</div>
      <div className="mt-4 grid gap-3 rounded-[12px] bg-blush/45 p-4 md:grid-cols-3">{benefits.map((benefit)=>{const Icon=benefit.icon;return <div key={benefit.title} className="flex items-center gap-4 md:px-6"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber bg-white text-amber"><Icon size={24}/></span><span><b className="font-serif text-lg">{benefit.title}</b><span className="mt-1 block text-[11px] leading-4 text-ink/70">{benefit.text}</span></span></div>;})}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_0.75fr]"><section className="grid gap-3 md:grid-cols-[260px_1fr]"><h2 className="font-serif text-[29px] font-semibold leading-none">Frequently<br />Asked Questions</h2><div className="space-y-2">{faqs.map(([question,answer],index)=><details key={question} open={index===0} className="group rounded-[10px] border border-plum/10 bg-white/75 px-4 py-3"><summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold [&::-webkit-details-marker]:hidden"><span>{question}</span><span className="text-magenta group-open:rotate-45">+</span></summary><p className="mt-2 text-[11px] leading-5 text-ink/70">{answer}</p></details>)}</div></section><aside className="rounded-[12px] bg-blush/55 p-6"><h2 className="font-serif text-[28px] font-semibold leading-none">Ready to book<br />with confidence?</h2><p className="mt-3 text-sm">Join thousands of women who book beautiful experiences they can trust.</p><Link href="/salons" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-[8px] bg-magenta px-5 text-sm font-bold text-white">Find your salon</Link></aside></div>
    </section><PublicFooter /><CustomerBottomNav active="home" /></main>;
}
