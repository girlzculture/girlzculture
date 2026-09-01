import { notFound } from "next/navigation";
import StyleCatalog from "@/components/public/StyleCatalog";

const representativeItems = [
  {
    name: "Box Braids",
    category: "Braids",
    categorySlug: "braids",
    styleId: "11111111-1111-4111-8111-111111111111",
    styleSlug: "box-braids",
    count: 12,
    image: "/images/braids-box.jpg",
    lengths: ["Shoulder", "Mid-back"],
    searchTerms: ["Box braid"],
    price: 150,
  },
  {
    name: "Silk Press",
    category: "Natural Hair",
    categorySlug: "natural-hair",
    styleId: "22222222-2222-4222-8222-222222222222",
    styleSlug: "silk-press",
    count: 40,
    image: "/images/salon-warm.jpg",
    lengths: ["Shoulder"],
    searchTerms: ["Silk-press"],
    price: 149.99,
  },
  {
    name: "Boho / Goddess Braids",
    category: "Braids",
    categorySlug: "braids",
    styleId: "33333333-3333-4333-8333-333333333333",
    styleSlug: "boho-goddess-braids",
    count: 17,
    image: "/images/hero-braids.jpg",
    lengths: ["Shoulder", "Mid-back", "Waist"],
    searchTerms: ["Bohemian braids", "Boho godess brads"],
    price: 250,
  },
  {
    name: "Zoë Twists",
    category: "Twists",
    categorySlug: "twists",
    styleId: "44444444-4444-4444-8444-444444444444",
    styleSlug: "zoe-twists",
    count: 3,
    image: "",
    lengths: ["Waist"],
    searchTerms: ["Zoe twist"],
    price: 250.01,
  },
  {
    name: "Unknown Price Locs",
    category: "Locs",
    categorySlug: "locs",
    styleId: "55555555-5555-4555-8555-555555555555",
    styleSlug: "unknown-price-locs",
    count: 8,
    image: "",
    lengths: ["Shoulder"],
  },
  {
    name: "Rare Crown Style",
    category: "Natural Hair",
    categorySlug: "natural-hair",
    styleId: "66666666-6666-4666-8666-666666666666",
    styleSlug: "rare-crown-style",
    count: 1,
    image: "",
    lengths: ["Waist"],
    searchTerms: ["Rare crown"],
    price: 200,
  },
];

const items = [
  ...representativeItems,
  ...Array.from({ length: 25 }, (_, index) => ({
    name: `Catalog Fixture Style ${String(index + 1).padStart(2, "0")}`,
    category: index % 2 ? "Braids" : "Natural Hair",
    categorySlug: index % 2 ? "braids" : "natural-hair",
    styleId: `77777777-7777-4777-8${String(index).padStart(3, "0")}-777777777777`,
    styleSlug: `catalog-fixture-style-${index + 1}`,
    count: 100 - index,
    image: "",
    lengths: index % 2 ? ["Shoulder", "Mid-back"] : ["Shoulder"],
    searchTerms: [`Fixture ${index + 1}`],
    price: 100 + index,
  })),
];

export default function StyleCatalogAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  return (
    <main className="min-h-[180vh] bg-cream p-4 text-ink">
      <StyleCatalog items={items} />
      <div aria-hidden="true" className="h-[120vh]" />
    </main>
  );
}
