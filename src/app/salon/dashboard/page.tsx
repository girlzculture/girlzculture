import SalonDashboard from "@/components/SalonDashboard";

export default async function SalonDashboardPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  return <SalonDashboard preview={process.env.NODE_ENV === "development" && preview === "1"} />;
}
