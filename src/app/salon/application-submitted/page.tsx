import Link from "next/link";
import { Building2, Check, ClipboardCheck, Mail, UserRound } from "lucide-react";
import { PublicHeader } from "@/components/site/PublicChrome";
import SalonPendingGate from "@/components/auth/SalonPendingGate";

export default function Submitted() {
  const steps = [
    [ClipboardCheck, "1. Review", "Our team reviews your application within 1–3 business days."],
    [Mail, "2. Email notification", "You’ll receive an email with our decision and next steps."],
    [UserRound, "3. Complete setup", "After approval, activate your plan and complete the live setup checklist."],
    [Building2, "4. Go live", "Your salon becomes discoverable only after every required gate passes."],
  ] as const;
  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader />
    <div className="mx-auto max-w-[1450px] px-4 py-10 text-center sm:px-8">
      <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-magenta text-white shadow-[0_14px_40px_rgba(214,24,107,.25)]"><Check size={54} strokeWidth={3}/></div>
      <h1 className="mt-6 font-serif text-5xl font-semibold text-plum">Application submitted!</h1>
      <p className="mt-3 text-xl">Thank you for joining Girlz Culture.</p>
      <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-ink/75">Our team will review your application. Approval opens subscription and setup; the salon becomes public only when every configured marketplace requirement passes.</p>
      <SalonPendingGate />
      <div className="mx-auto mt-7 max-w-lg rounded-[16px] bg-blush/65 p-6 text-left"><h2 className="font-serif text-2xl font-semibold text-plum">Please watch your email</h2><p className="mt-2 text-sm leading-6">We’ll notify you of our decision and guide you through the next steps.</p></div>
      <section className="mt-8 rounded-[18px] border border-plum/10 bg-white/80 p-6 shadow-sm"><h2 className="font-serif text-3xl font-semibold text-plum">What happens next?</h2><div className="mt-6 grid gap-4 md:grid-cols-4">{steps.map(([Icon, title, body]) => <article key={title} className="rounded-[14px] bg-blush/30 p-5 text-left"><Icon className="text-magenta"/><h3 className="mt-4 font-semibold text-plum">{title}</h3><p className="mt-2 text-sm leading-6 text-ink/65">{body}</p></article>)}</div></section>
      <Link href="/" className="mt-8 inline-flex min-w-72 justify-center rounded-[9px] bg-magenta px-8 py-4 font-bold text-white">Back to Home</Link>
    </div>
  </main>;
}
