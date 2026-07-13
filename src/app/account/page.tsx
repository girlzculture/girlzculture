import { Suspense } from "react";
import CustomerAccount from "@/components/CustomerAccount";

export default function AccountPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-cream text-plum">Loading account…</main>}><CustomerAccount /></Suspense>;
}
