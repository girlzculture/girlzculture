import OwnerDashboardApp from "@/components/owner/OwnerDashboardApp";

export default function SalonDashboard({ preview = false }: { preview?: boolean }) {
  return <OwnerDashboardApp section="overview" preview={preview} />;
}
