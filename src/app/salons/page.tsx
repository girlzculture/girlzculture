import SalonDiscovery from "@/components/public/SalonDiscovery";
import {
  CustomerBottomNav,
  PublicHeader,
  TrustStrip,
} from "@/components/site/PublicChrome";
import { discoverNearbySalons } from "@/lib/discoveryServer";
import {
  normalizeRadius,
  validCoordinates,
} from "@/lib/location";
import { capturePublicPageFailure } from "@/lib/publicPageMonitoring";
import FirstRelevantLocationRequest from "@/components/location/FirstRelevantLocationRequest";

export const dynamic = "force-dynamic";

function stringValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(stringValue(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function SalonsPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const query = await searchParams;
  const latitude = stringValue(query.lat).trim();
  const longitude = stringValue(query.lng).trim();
  const origin = {
    lat: Number(latitude),
    lng: Number(longitude),
  };
  const validOrigin =
    latitude && longitude && validCoordinates(origin)
      ? origin
      : null;
  const initialQuery =
    stringValue(query.q) || stringValue(query.style);
  const initialStyleId = stringValue(query.style_id);
  const location = stringValue(query.location);
  const radius = normalizeRadius(stringValue(query.radius));
  const sort = new Set(["distance", "rating", "price_low", "price_high"]).has(
    stringValue(query.sort),
  )
    ? (stringValue(query.sort) as "distance" | "rating" | "price_low" | "price_high")
    : "distance";
  const initialFilters = {
    radiusMiles: radius,
    minimumRating: Math.max(0, Math.min(5, numberValue(query.rating, 0))),
    maximumPrice: stringValue(query.max_price),
    date: /^\d{4}-\d{2}-\d{2}$/.test(stringValue(query.date))
      ? stringValue(query.date)
      : "",
    sort,
    promotionOnly: stringValue(query.offers) === "true",
  };
  let initial = {
    salons: [],
    total: 0,
  } as Awaited<ReturnType<typeof discoverNearbySalons>>;

  if (validOrigin) {
    try {
      initial = await discoverNearbySalons({
        origin: validOrigin,
        radius,
        style: stringValue(query.style),
        masterStyleId: initialStyleId || null,
        limit: "all",
      });
    } catch (error) {
      await capturePublicPageFailure(
        error,
        "salon-discovery-page",
        "load-initial-nearby-salons",
      );
    }
  }

  return (
    <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0">
      <PublicHeader active="salons" />
      <FirstRelevantLocationRequest />
      <section className="mx-auto w-full max-w-[1760px] px-3 pb-5 pt-3 sm:px-8 sm:pt-5 lg:px-12 2xl:px-16">
        <div className="mb-2 flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full bg-plum px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-white">
            AI
          </span>
          <h2 className="min-w-0 truncate text-[13px] font-bold text-ink sm:text-sm">
            Tell us the look you want
          </h2>
        </div>
        <SalonDiscovery
          initialSalons={initial.salons}
          initialTotal={initial.total}
          initialQuery={initialQuery}
          initialStyleId={initialStyleId}
          initialLocation={location}
          initialOrigin={validOrigin}
          initialFilters={initialFilters}
        />
      </section>
      <TrustStrip />
      <CustomerBottomNav active="search" />
    </main>
  );
}
