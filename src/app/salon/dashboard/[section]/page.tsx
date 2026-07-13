import { notFound } from "next/navigation";
import OwnerDashboardApp from "@/components/owner/OwnerDashboardApp";
import { DashboardSection } from "@/components/owner/OwnerDashboardShell";

const sections = new Set<DashboardSection>(["overview", "my-page", "photos", "styles", "stylists", "products", "availability", "bookings", "reviews", "earnings", "promotions", "subscription", "settings"]);

export default async function OwnerDashboardSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section as DashboardSection)) notFound();
  return <OwnerDashboardApp section={section as DashboardSection} />;
}
