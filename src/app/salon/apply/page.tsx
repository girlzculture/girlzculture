import { Suspense } from "react";
import { CalendarCheck, TrendingUp, UsersRound } from "lucide-react";
import SalonApplication from "@/components/SalonApplication";
import { PublicHeader } from "@/components/site/PublicChrome";
import { getEngineList } from "@/lib/engineConfigServer";

export default async function ApplyPage() {
  const benefits = [[UsersRound, "Reach more clients"], [CalendarCheck, "Manage bookings"], [TrendingUp, "Build your business"]] as const;
  const businessTypes=await getEngineList("catalog.business_types",["Braiding Studio","Hair Salon","Beauty Shop","Independent Braider","Mobile Braider","Natural Hair Studio","Other"],30);
  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader/>
    <div className="mx-auto grid w-full max-w-[1540px] gap-0 px-4 py-8 lg:grid-cols-[390px_1fr] lg:px-10">
      <aside className="relative hidden min-h-[760px] overflow-hidden rounded-l-[20px] bg-[url('/images/hero-braids.jpg')] bg-cover bg-center lg:block">
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent"/>
        <div className="absolute inset-x-8 bottom-10 text-white">
          <h2 className="font-serif text-4xl font-semibold">Grow Your Beauty Business with Girlz Culture</h2>
          <p className="mt-4 text-sm leading-6 text-white/80">Join a premium directory and connect with clients in your community.</p>
          <ul className="mt-6 space-y-4 text-sm">{benefits.map(([Icon, label]) => <li key={label} className="flex items-center gap-3"><Icon size={18} className="text-amber" aria-hidden="true"/>{label}</li>)}</ul>
        </div>
      </aside>
      <div className="lg:-ml-px"><Suspense fallback={<div className="rounded-[18px] bg-white p-10 text-center text-plum">Loading application…</div>}><SalonApplication businessTypes={businessTypes}/></Suspense></div>
    </div>
  </main>;
}
