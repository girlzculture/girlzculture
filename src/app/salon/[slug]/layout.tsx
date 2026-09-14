import { notFound } from "next/navigation";
import {
  marketplaceBrowsingAvailable,
  siteAccessActive,
} from "@/lib/marketplaceAccessServer";
import { isRegisteredTestBusiness } from "@/lib/marketplaceEligibilityServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import PrelaunchPage from "@/app/prelaunch/page";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function PublicBusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  if (!(await marketplaceBrowsingAvailable())) return <PrelaunchPage />;
  const siteAccess = await siteAccessActive();
  const { slug } = await params;
  const admin = getSupabaseAdmin();
  const result = await admin.from("salons").select("id").eq("slug", slug).maybeSingle();
  if (result.error) throw new Error("MARKETPLACE_ELIGIBILITY_UNAVAILABLE");
  if (!siteAccess && result.data && await isRegisteredTestBusiness(admin, result.data.id)) notFound();
  return children;
}
