import Link from "next/link";
import { CalendarDays, Store, TrendingUp } from "lucide-react";
import { Suspense } from "react";
import SalonSignup from "@/components/SalonSignup";

export default function SignupPage() {
  return <main className="min-h-screen bg-cream p-4 text-ink sm:p-6"><div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-[1500px] overflow-hidden rounded-[22px] border border-plum/10 bg-white shadow-[0_20px_70px_rgba(26,18,32,.09)] lg:grid-cols-[.95fr_1fr]">
    <section className="relative hidden min-h-[760px] overflow-hidden bg-[url('/images/hero-braids.jpg')] bg-cover bg-center lg:block"><div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/20"/><div className="absolute inset-x-12 top-10 font-serif text-4xl font-bold text-white">Girlz Culture<span className="block font-sans text-xs uppercase tracking-[.2em] text-amber">Premium beauty marketplace</span></div><div className="absolute inset-x-12 bottom-14 text-white"><h2 className="max-w-sm font-serif text-5xl font-semibold leading-[1.05]">Build your salon presence<span className="text-magenta">.</span></h2><ul className="mt-7 space-y-4 text-sm"><li className="flex items-center gap-3"><CalendarDays size={19}/>Manage booking requests</li><li className="flex items-center gap-3"><TrendingUp size={19}/>Grow your brand</li><li className="flex items-center gap-3"><Store size={19}/>Publish your salon profile</li></ul></div></section>
    <section className="flex items-center justify-center p-5 sm:p-10 lg:p-16"><div className="w-full max-w-xl"><div className="mb-7 flex items-center justify-between"><Link href="/" className="font-serif text-3xl font-bold text-plum">Girlz Culture</Link><span className="hidden text-sm sm:block">Already have an account? <Link href="/salon/login" className="text-magenta">Log in</Link></span></div><h1 className="font-serif text-5xl font-semibold text-plum">Create Your Account</h1><p className="mb-8 mt-3 text-lg text-ink/70">Join Girlz Culture and grow your beauty business.</p><Suspense fallback={<p className="text-sm text-plum">Loading signup…</p>}><SalonSignup/></Suspense></div></section>
  </div></main>;
}
