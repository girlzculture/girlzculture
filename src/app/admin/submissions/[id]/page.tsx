import AdminApplicationReview from "@/components/admin/AdminApplicationReview";

export default async function AdminApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminApplicationReview id={id} />;
}
