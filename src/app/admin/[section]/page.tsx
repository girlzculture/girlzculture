import { notFound } from "next/navigation";
import AdminDashboard, { AdminSection } from "@/components/AdminDashboard";

const sections = new Set<AdminSection>(["overview", "submissions", "salons", "customers", "bookings", "quality", "reviews", "finance", "marketing", "content", "support", "subscriptions", "settings"]);

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section as AdminSection)) notFound();
  return <AdminDashboard section={section as AdminSection} />;
}
