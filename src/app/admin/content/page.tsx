import Link from "next/link";
import { Layers3 } from "lucide-react";
import AdminDashboard from "@/components/AdminDashboard";

export default function AdminContentPage() {
  return (
    <div className="relative">
      <Link
        href="/admin/content/service-catalog"
        data-testid="open-service-catalog"
        className="fixed bottom-24 right-4 z-[150] inline-flex min-h-12 items-center gap-2 rounded-full bg-magenta px-5 text-xs font-bold text-white shadow-[0_14px_36px_rgba(13,17,20,.24)] md:bottom-6 md:right-6"
      >
        <Layers3 size={17} />
        Service Catalog
      </Link>
      <AdminDashboard section="content" />
    </div>
  );
}
