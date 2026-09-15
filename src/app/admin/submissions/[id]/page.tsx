import AdminSubmissionDetail from "@/components/admin/AdminSubmissionDetail";
import AdminDashboard from "@/components/AdminDashboard";

export default async function AdminApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const requestedReturn = Array.isArray(query.return) ? query.return[0] : query.return;
  const returnTo = requestedReturn?.startsWith("/admin/submissions")
    ? requestedReturn
    : "/admin/submissions";
  return <AdminDashboard section="submissions" recordId={id}><AdminSubmissionDetail id={id} returnTo={returnTo} /></AdminDashboard>;
}
