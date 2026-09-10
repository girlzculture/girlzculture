import { notFound } from "next/navigation";
import AdminContentManager from "@/components/AdminContentManager";
import BusinessSignupLanding from "@/components/business/BusinessSignupLanding";
import { getPublishedContentPage } from "@/lib/content";
import { BUSINESS_SIGNUP_CONTENT_LABEL, validateBusinessSignupContent } from "@/lib/businessSignupContent";
import "@/app/business/business-onboarding.css";

export default async function BusinessCmsAcceptancePage({ searchParams }: {
  searchParams: Promise<{ scope?: string; view?: string }>;
}) {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  const { scope, view } = await searchParams;
  if (!scope || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope)) notFound();
  if (view === "published") {
    // Each automated scenario gets its own provider record, avoiding shared
    // published-state mutations while other browser tests run in parallel.
    const page = await getPublishedContentPage(`business-signup-acceptance-${scope}`);
    if (!page) notFound();
    const serialized = page.labels?.[BUSINESS_SIGNUP_CONTENT_LABEL];
    if (!serialized) notFound();
    const content = validateBusinessSignupContent(JSON.parse(serialized), { forPublication: true });
    return <BusinessSignupLanding content={content} />;
  }
  return <div className="mx-auto max-w-7xl p-5" data-testid="business-cms-acceptance">
    <p className="mb-5 rounded-lg bg-cream p-3 text-sm text-plum">Automated acceptance fixture. Authentication and database persistence are simulated.</p>
    <AdminContentManager acceptanceAccessToken={`business-cms-acceptance-${scope}`} initialRecordId="page-business-signup" />
  </div>;
}
