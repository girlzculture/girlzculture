import { Suspense } from "react";
import CustomerAccount from "@/components/CustomerAccount";
import {marketplaceBrowsingAvailable,marketplaceHomeHref} from "@/lib/marketplaceAccessServer";

export default async function AccountPage() {
  const [discoveryAvailable,homeHref]=await Promise.all([marketplaceBrowsingAvailable(),marketplaceHomeHref()]);
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-cream text-plum">Loading account…</main>}><CustomerAccount discoveryAvailable={discoveryAvailable} homeHref={homeHref}/></Suspense>;
}
