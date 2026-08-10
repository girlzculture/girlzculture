import { notFound } from "next/navigation";
import AdminDashboard, { AdminSection } from "@/components/AdminDashboard";

const detailSections = new Set<AdminSection>([
  "salons",
  "customers",
  "bookings",
  "quality",
  "reviews",
  "finance",
  "marketing",
  "content",
  "support",
  "complaints",
  "subscriptions",
  "engine",
  "settings",
]);

export default async function AdminRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string; recordId: string }>;
  searchParams: Promise<{ return?: string | string[] }>;
}) {
  const { section, recordId } = await params;
  if (!detailSections.has(section as AdminSection)) notFound();

  const returnValue = (await searchParams).return;
  const requestedReturn = Array.isArray(returnValue) ? returnValue[0] : returnValue;
  // Detail workspaces intentionally link across admin sections (for example a
  // customer record opens one of its bookings). Preserve that parent context,
  // but only when it is an unambiguous internal admin path.
  const isSafeAdminReturn = (value: string | undefined): value is string =>
    Boolean(
      value &&
        value.startsWith("/admin/") &&
        !value.startsWith("//") &&
        !value.includes("\\") &&
        !/[\u0000-\u001f\u007f]/.test(value),
    );
  const safeReturn =
    isSafeAdminReturn(requestedReturn)
      ? requestedReturn
      : `/admin/${section}`;

  return (
    <AdminDashboard
      section={section as AdminSection}
      recordId={recordId}
      returnTo={safeReturn}
    />
  );
}
