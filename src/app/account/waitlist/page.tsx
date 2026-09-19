import Link from "next/link";
import AppointmentWaitlist from "@/components/booking/AppointmentWaitlist";
import LanguageSelector from "@/components/i18n/LanguageSelector";
export default function WaitlistPage(){return <main className="mx-auto min-h-screen max-w-5xl space-y-6 bg-background p-4 sm:p-8"><header className="flex items-center justify-between gap-3"><Link href="/account" className="inline-flex min-h-11 items-center font-semibold text-primary">Girlz Culture · Account</Link><LanguageSelector compact/></header><AppointmentWaitlist/></main>;}
