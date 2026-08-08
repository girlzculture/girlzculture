import { notFound } from "next/navigation";
import StyleCatalog from "@/components/public/StyleCatalog";

const items = [
  {
    name: "Box Braids",
    category: "Braids",
    categorySlug: "braids",
    styleId: "11111111-1111-4111-8111-111111111111",
    styleSlug: "box-braids",
    count: 12,
    image: "/images/braids-box.jpg",
    length: "Mid-back",
    maintenance: "Medium",
    price: 120,
  },
  {
    name: "Silk Press",
    category: "Natural Hair",
    categorySlug: "natural-hair",
    styleId: "22222222-2222-4222-8222-222222222222",
    styleSlug: "silk-press",
    count: 8,
    image: "/images/salon-warm.jpg",
    length: "Shoulder",
    maintenance: "Low",
    price: 90,
  },
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
