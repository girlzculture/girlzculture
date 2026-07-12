import { Suspense } from "react";
import CustomerAccount from "@/components/CustomerAccount";
export default async function AccountPage({searchParams}:{searchParams:Promise<{preview?:string}>}){const {preview}=await searchParams;return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-cream text-plum">Loading account…</main>}><CustomerAccount preview={process.env.NODE_ENV==="development"&&preview==="1"}/></Suspense>}
