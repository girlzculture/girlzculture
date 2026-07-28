import SalonDiscovery from "@/components/public/SalonDiscovery";
import { CustomerBottomNav, PublicHeader, TrustStrip } from "@/components/site/PublicChrome";
import { discoverNearbySalons } from "@/lib/discoveryServer";
import { normalizeRadius, validCoordinates } from "@/lib/location";
import BeautyConcierge from "@/components/public/BeautyConcierge";
import { capturePublicPageFailure } from "@/lib/publicPageMonitoring";
import FirstRelevantLocationRequest from "@/components/location/FirstRelevantLocationRequest";

export const dynamic = "force-dynamic";

function stringValue(value: string | string[] | undefined) { return typeof value === "string" ? value : ""; }

export default async function SalonsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const latitude = stringValue(query.lat).trim();
  const longitude = stringValue(query.lng).trim();
  const origin = { lat: Number(latitude), lng: Number(longitude) };
  const validOrigin =
    latitude && longitude && validCoordinates(origin) ? origin : null;
  const style = stringValue(query.style);
  const location = stringValue(query.location);
  const radius = normalizeRadius(stringValue(query.radius));
  let initial = { salons: [], total: 0 } as Awaited<ReturnType<typeof discoverNearbySalons>>;
  if (validOrigin) {
    try { initial = await discoverNearbySalons({ origin: validOrigin, radius, style, limit: 20 }); }
    catch (error) { await capturePublicPageFailure(error, "salon-discovery-page", "load-initial-nearby-salons"); }
  }
  return <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0"><PublicHeader active="salons"/><FirstRelevantLocationRequest/><section className="mx-auto w-full max-w-[1760px] px-3 pb-5 pt-3 sm:px-8 sm:pt-5 lg:px-12 2xl:px-16"><BeautyConcierge/><SalonDiscovery initialSalons={initial.salons} initialTotal={initial.total} initialStyle={style} initialLocation={location} initialOrigin={validOrigin}/></section><TrustStrip/><CustomerBottomNav active="search"/></main>;
}
