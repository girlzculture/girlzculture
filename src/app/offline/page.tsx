import Link from "next/link";
import { WifiOff } from "lucide-react";

export default function OfflinePage(){return <main className="grid min-h-screen place-items-center bg-cream p-6 text-center text-ink"><div className="max-w-md rounded-[22px] border border-plum/10 bg-white p-9 shadow-xl"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-blush text-plum"><WifiOff size={30}/></span><h1 className="mt-5 font-serif text-4xl text-plum">You’re offline</h1><p className="mt-3 text-sm leading-6 text-ink/60">Reconnect to view live availability, pricing, and bookings. Previously visited public pages may still be available.</p><Link href="/" className="mt-6 inline-flex rounded-[9px] bg-magenta px-6 py-3 font-bold text-white">Try home again</Link></div></main>}
