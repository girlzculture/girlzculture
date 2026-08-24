import AdminDashboard from "@/components/AdminDashboard";
import AdminServiceCatalogWorkspace from "@/components/admin/AdminServiceCatalogWorkspace";
import AdminPromotionSectionWorkspace from "@/components/admin/AdminPromotionSectionWorkspace";

const PROMOTION_RECORDS = new Set([
  "page-home--hero-promotion-carousel",
  "page-about--promotional-carousel-one",
  "page-about--promotional-carousel-two",
]);

export default async function AdminContentRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ recordId: string }>;
  searchParams: Promise<{ return?: string | string[] }>;
}) {
  const { recordId } = await params;
  if (recordId === "service-catalog") {
    return <AdminServiceCatalogWorkspace />;
  }
  if (PROMOTION_RECORDS.has(recordId)) {
    return <AdminPromotionSectionWorkspace recordId={recordId} />;
  }
  const returnValue = (await searchParams).return;
  const requestedReturn = Array.isArray(returnValue) ? returnValue[0] : returnValue;
  const safeReturn =
    requestedReturn &&
    requestedReturn.startsWith("/admin/") &&
    !requestedReturn.startsWith("//") &&
    !requestedReturn.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(requestedReturn)
      ? requestedReturn
      : "/admin/content";
  return (
    <AdminDashboard
      section="content"
      recordId={recordId}
      returnTo={safeReturn}
    />
  );
}
