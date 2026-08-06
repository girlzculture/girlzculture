import AdminSubmissionDetail from "@/components/admin/AdminSubmissionDetail";

export default async function AdminApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminSubmissionDetail id={id} />;
}
