import { notFound } from "next/navigation";
import OwnerDashboardApp from "@/components/owner/OwnerDashboardApp";
import { DashboardSection } from "@/components/owner/OwnerDashboardShell";

const sections: DashboardSection[] = ["my-page","photos","styles","stylists","products","availability","bookings","reviews","earnings","promotions","subscription","settings"];

export default async function OwnerDashboardSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { section } = await params;
  const { preview } = await searchParams;
  if (!sections.includes(section as DashboardSection)) notFound();
  return <OwnerDashboardApp section={section as DashboardSection} preview={process.env.NODE_ENV === "development" && preview === "1"} />;
}
