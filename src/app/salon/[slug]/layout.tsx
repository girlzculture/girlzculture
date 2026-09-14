import { notFound } from "next/navigation";
import { customerMarketplaceLive } from "@/lib/marketplaceLaunchCore";
import { isRegisteredTestBusiness } from "@/lib/marketplaceEligibilityServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import PrelaunchPage from "@/app/prelaunch/page";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function PublicBusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  if (!customerMarketplaceLive()) return <PrelaunchPage />;
  const { slug } = await params;
  const admin = getSupabaseAdmin();
  const result = await admin.from("salons").select("id").eq("slug", slug).maybeSingle();
  if (result.error) throw new Error("MARKETPLACE_ELIGIBILITY_UNAVAILABLE");
  if (result.data && await isRegisteredTestBusiness(admin, result.data.id)) notFound();
  return children;
}
