import type { Metadata } from "next";
import FeaturedSalonPlacement from "@/components/public/FeaturedSalonPlacement";
import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";

export const metadata: Metadata = { title: "Featured Salons", description: "Discover clearly labeled featured braiding salons near your chosen location." };

export default function FeaturedSalonsPage() {
  return <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0"><PublicHeader/><section className="border-b border-plum/10 bg-[linear-gradient(120deg,#fffaf6,#f7e3e9)] px-4 py-10 sm:px-6 lg:px-10"><div className="mx-auto w-full max-w-[1760px]"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-magenta">Local paid placements</p><h1 className="mt-2 font-serif text-4xl font-semibold text-plum sm:text-6xl">Featured salons near you.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">These salons have active, paid Featured campaigns and are shown only when they are genuinely within the campaign radius of your location.</p></div></section><div className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-10"><FeaturedSalonPlacement viewAll title="Featured Salons"/></div><PublicFooter/><CustomerBottomNav active="search"/></main>;
}
