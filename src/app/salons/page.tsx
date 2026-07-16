import SalonDiscovery from "@/components/public/SalonDiscovery";
import { CustomerBottomNav, PublicHeader, TrustStrip } from "@/components/site/PublicChrome";
import { discoverNearbySalons } from "@/lib/discoveryServer";
import { normalizeRadius, validCoordinates } from "@/lib/location";

export const dynamic = "force-dynamic";

function stringValue(value: string | string[] | undefined) { return typeof value === "string" ? value : ""; }

export default async function SalonsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const origin = { lat: Number(stringValue(query.lat)), lng: Number(stringValue(query.lng)) };
  const validOrigin = validCoordinates(origin) ? origin : null;
  const style = stringValue(query.style);
  const location = stringValue(query.location);
  const radius = normalizeRadius(stringValue(query.radius));
  let initial = { salons: [], total: 0 } as Awaited<ReturnType<typeof discoverNearbySalons>>;
  if (validOrigin) {
    try { initial = await discoverNearbySalons({ origin: validOrigin, radius, style, limit: 20 }); }
    catch (error) { console.error("Initial nearby salon query failed", error); }
  }
  return <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0"><PublicHeader active="salons"/><section className="mx-auto w-full max-w-[1760px] px-3 pb-5 pt-3 sm:px-8 sm:pt-7 lg:px-12 2xl:px-16"><h1 className="font-serif text-[32px] font-semibold leading-none tracking-[-0.04em] text-ink sm:text-[56px]">Find salons that fit your style<span className="text-magenta">.</span></h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">Choose your location, compare real prices and reviews, and book with confidence.</p><div className="mt-4"><SalonDiscovery initialSalons={initial.salons} initialTotal={initial.total} initialStyle={style} initialLocation={location} initialOrigin={validOrigin}/></div></section><TrustStrip/><CustomerBottomNav active="search"/></main>;
}
