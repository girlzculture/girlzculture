import AdminDashboard from "@/components/AdminDashboard";
import AdminMarketplacePreviewButton from "@/components/admin/AdminMarketplacePreviewButton";

export default function AdminPage() {
  return (
    <div className="relative">
      <AdminDashboard section="overview" />
      <div className="fixed bottom-20 right-4 z-[140] md:bottom-6 md:right-6">
        <AdminMarketplacePreviewButton />
      </div>
    </div>
  );
}
