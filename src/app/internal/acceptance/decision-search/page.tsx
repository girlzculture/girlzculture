import { notFound } from "next/navigation";
import {
  parseDecisionSearchIntent,
  matchDecisionLocationMarket,
  type DecisionIntentCatalogService,
} from "@/lib/decisionSearchIntentCore";
import {
  evaluateDecisionStyleCandidates,
  selectDecisionStyleWithOpening,
} from "@/lib/decisionSearchEnrichmentCore";

const catalog: DecisionIntentCatalogService[] = [
  { id: "service-boho", name: "Boho Braids", aliases: ["Bohemian Braids"], categoryId: "category-braiding", categoryName: "Braiding", serviceGroupId: "group-braids", serviceGroupName: "Braids" },
  { id: "service-box", name: "Box Braids", aliases: ["Box Braid"], categoryId: "category-braiding", categoryName: "Braiding", serviceGroupId: "group-braids", serviceGroupName: "Braids" },
  { id: "service-knotless", name: "Knotless Braids", aliases: ["Knotless"], categoryId: "category-braiding", categoryName: "Braiding", serviceGroupId: "group-braids", serviceGroupName: "Braids" },
  { id: "service-dominican", name: "Dominican Blowout", aliases: ["Dominican Blow Out"], categoryId: "category-styling", categoryName: "Hair Styling", serviceGroupId: "group-blowouts", serviceGroupName: "Blowouts" },
  { id: "service-natural", name: "Natural Hair Consultation", aliases: [], categoryId: "category-natural", categoryName: "Natural Hair", serviceGroupId: "group-natural", serviceGroupName: "Natural Hair Services" },
];

const markets = [
  { name: "Bronx", state_code: "NY", center_latitude: 40.8448, center_longitude: -73.8648 },
  { name: "Brooklyn", state_code: "NY", center_latitude: 40.6782, center_longitude: -73.9442 },
];

const queries = [
  "salons near me",
  "Boho braids",
  "Box braids",
  "affordable salons near me",
  "affordable knotless braids near me",
  "best rated braiding salon near me",
  "Dominican blowout in the Bronx",
  "salon open Saturday under $80",
  "highly rated natural hair salon within five miles",
  "knotless braids under $150 with a Saturday opening",
] as const;

export default async function DecisionSearchAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  const now = new Date("2026-08-07T12:00:00.000Z");
  const fixture = evaluateDecisionStyleCandidates({
    salonId: "fixture-salon",
    styles: [
      { id: "cheap-no-opening", salon_id: "fixture-salon", master_style_id: "service-box", service_group_id: "group-braids", base_price: 60, price_display_min: 60, price_display_max: 80 },
      { id: "discounted-with-opening", salon_id: "fixture-salon", master_style_id: "service-box", service_group_id: "group-braids", base_price: 100, price_display_min: 100, price_display_max: 120 },
    ],
    promotions: [
      { id: "group-offer", salon_id: "fixture-salon", promotion_type: "percentage", discount_value: 25, target_scope: "service_groups", target_ids: ["group-braids"], restrictions: { minimum_subtotal: 90 } },
    ],
    maximumPrice: 80,
    promotionOnly: false,
  });
  const selected = await selectDecisionStyleWithOpening({
    candidates: fixture.eligible,
    requireOpening: true,
    loadOpening: async (candidate) => candidate.style.id === "discounted-with-opening" ? { date: "2026-08-08", value: "10:00" } : null,
  });
  return <main className="min-h-screen bg-cream p-6 text-ink"><h1 className="font-serif text-4xl text-plum">Deterministic search acceptance</h1><section className="mt-5 rounded-xl border border-plum/10 bg-white p-4" data-testid="decision-service-fixture" data-selected-service={selected.candidate?.style.id || ""} data-selected-price={String(selected.candidate?.price ?? "")} data-opening-date={selected.opening?.date || ""}><b>Executable service, promotion, budget and opening fixture</b></section><ol className="mt-6 space-y-3">{queries.map((query, index) => {
    const intent = parseDecisionSearchIntent(query, catalog, {}, now);
    const location = matchDecisionLocationMarket(query, markets);
    return <li key={query} data-testid={`decision-query-${index + 1}`} data-query={query} data-intent={JSON.stringify(intent)} data-location={location?.market.name || ""} className="rounded-xl border border-plum/10 bg-white p-4"><b>{query}</b><pre className="mt-2 overflow-auto text-[10px]">{JSON.stringify(intent, null, 2)}</pre></li>;
  })}</ol></main>;
}
