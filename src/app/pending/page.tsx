import Link from "next/link";
import { Clock3 } from "lucide-react";
import SalonPendingGate from "@/components/auth/SalonPendingGate";

export default function PendingPage() {
  return <main className="grid min-h-screen place-items-center bg-cream p-5 text-ink">
    <section className="w-full max-w-xl rounded-[22px] border border-plum/10 bg-white p-8 text-center shadow-[0_20px_60px_rgba(26,18,32,.08)] sm:p-10">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-blush text-plum"><Clock3 size={30}/></span>
      <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-magenta">Salon application</p>
      <h1 className="mt-2 font-serif text-4xl font-semibold text-plum">Your application is under review</h1>
      <p className="mt-4 leading-7 text-ink/70">Your salon record is safe. Girlz Culture will email you when the review is complete. This page automatically sends you to the correct setup or dashboard route as soon as your status changes.</p>
      <SalonPendingGate />
      <div className="mt-6 flex flex-wrap justify-center gap-3"><Link href="/" className="rounded-lg border border-plum/20 px-5 py-3 text-sm font-bold text-plum">Return home</Link><Link href="/contact" className="rounded-lg bg-magenta px-5 py-3 text-sm font-bold text-white">Contact support</Link></div>
    </section>
  </main>;
}
