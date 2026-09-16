import AdminSubmissionsWorkspace from "@/components/admin/AdminSubmissionsWorkspace";
import AdminDashboard from "@/components/AdminDashboard";

export default function AdminSubmissionsPage() {
  return <AdminDashboard section="submissions"><AdminSubmissionsWorkspace embedded/></AdminDashboard>;
}
