import Link from "next/link";
import { Check } from "lucide-react";
import { PublicHeader } from "@/components/site/PublicChrome";
import SalonPendingGate from "@/components/auth/SalonPendingGate";

export default function Submitted() {
  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader />
    <div className="mx-auto max-w-[1450px] px-4 py-10 text-center sm:px-8">
      <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-magenta text-white shadow-[0_14px_40px_rgba(0,131,166,.25)]"><Check size={54} strokeWidth={3}/></div>
      <h1 className="mt-6 font-serif text-5xl font-semibold text-plum">Application received</h1>
      <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ink/75">We have received your application. Our team will review and get back to you within 2–4 business days.</p>
      <SalonPendingGate />
      <Link href="/" className="mt-8 inline-flex min-w-72 justify-center rounded-[9px] bg-magenta px-8 py-4 font-bold text-white">Back to Home</Link>
    </div>
  </main>;
}
