import AdminSubmissionDetail from "@/components/admin/AdminSubmissionDetail";

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
  return <AdminSubmissionDetail id={id} returnTo={returnTo} />;
}
