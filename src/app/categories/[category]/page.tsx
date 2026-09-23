import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ACTIVE_BUSINESS_CATEGORIES, categoryOpeningMessage } from "@/lib/businessCategories";
import { PublicHeader, PublicFooter } from "@/components/site/PublicChrome";
import NearbySalonPlacement from "@/components/public/NearbySalonPlacement";
import SafeImage from "@/components/site/SafeImage";
import { marketplaceBrowsingAvailable } from "@/lib/marketplaceAccessServer";

export default async function CategoryComingSoon({ params }: { params: Promise<{ category: string }> }) {
  const id = (await params).category;
  const category = ACTIVE_BUSINESS_CATEGORIES.find(item => item.slug === id);
  if (!category) notFound();
  if (category.live) redirect("/salons?category=hair-salon-braiding");
  const browsing = await marketplaceBrowsingAvailable();
  const photo = { nails: "nails", massage: "massage", facial: "facial", tattoo: "tattoo", lashes: "lashes", barber: "barber" }[category.photo];
  return <main className="min-h-screen bg-cream text-ink"><PublicHeader/>
    <section className="mx-auto grid max-w-6xl gap-7 px-5 py-10 md:grid-cols-2 md:items-center md:py-16">
      <div><p className="text-sm font-semibold uppercase tracking-widest text-magenta">Coming soon</p><h1 className="mt-3 font-serif text-4xl sm:text-6xl">{category.name}</h1>
        <p className="mt-6 max-w-xl text-base leading-7">{categoryOpeningMessage(category.name)}</p>
        <Link href={`/business/waitlist?category=${category.slug}`} className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-magenta px-6 font-semibold text-white">Join the business waitlist</Link>
      </div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl"><SafeImage src={`/images/business/${photo}-service.avif`} fallbackSrc="/images/business/hair-service.avif" alt="" className="h-full w-full object-cover"/></div>
    </section>
    <div className="mx-auto max-w-6xl px-5 pb-10">{browsing ? <NearbySalonPlacement title="Available Hair & Braiding Businesses" description="Explore the businesses currently available in your area."/> : <section className="rounded-2xl border border-plum/10 bg-white p-6"><h2 className="font-serif text-2xl">Hair & Braiding</h2><p className="mt-2 text-sm">Discover hair and braiding businesses in your area.</p><Link className="mt-4 inline-block font-semibold text-magenta underline" href="/site-access">Explore available hair and braiding businesses</Link></section>}</div>
    <PublicFooter/>
  </main>;
}
