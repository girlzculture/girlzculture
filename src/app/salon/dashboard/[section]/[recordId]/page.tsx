import { notFound } from "next/navigation";
import OwnerDashboardApp from "@/components/owner/OwnerDashboardApp";
import type { DashboardSection } from "@/components/owner/OwnerDashboardShell";

const focusedSections = new Set<DashboardSection>([
  "my-page",
  "photos",
  "styles",
  "stylists",
  "products",
  "availability",
  "bookings",
  "messages",
  "reviews",
  "earnings",
  "promotions",
  "settings",
]);

export default async function OwnerDashboardRecordPage({
  params,
}: {
  params: Promise<{ section: string; recordId: string }>;
}) {
  const { section, recordId } = await params;
  const isReferralWorkspace = section === "subscription" && recordId === "referrals";
  if ((!focusedSections.has(section as DashboardSection) && !isReferralWorkspace) || !recordId) notFound();

  return (
    <OwnerDashboardApp
      section={section as DashboardSection}
      initialRecordId={decodeURIComponent(recordId)}
      initialBookingId={section === "bookings" ? decodeURIComponent(recordId) : ""}
    />
  );
}
