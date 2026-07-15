import { AlertTriangle, BadgeCheck, ShieldCheck } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import ComplaintForm from "@/components/public/ComplaintForm";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function ComplaintPage() {
  const { data } = await getSupabaseAdmin().from("salons").select("id,name,address_city,address_state").ilike("status", "active").order("name").limit(1000);
  return <main className="min-h-screen bg-cream text-ink"><PublicHeader/><section className="mx-auto grid w-full max-w-[1320px] gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[.72fr_1.28fr] lg:py-16"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-magenta">Customer care</p><h1 className="mt-3 font-serif text-5xl leading-[.95] text-plum sm:text-6xl">Submit a complaint<span className="text-magenta">.</span></h1><p className="mt-5 max-w-lg text-sm leading-7 text-ink/65">Tell our platform support team what happened. Every complaint is reviewed; only complaints matched to a real Girlz Culture booking affect automated salon quality monitoring.</p><div className="mt-8 space-y-4">{[[AlertTriangle,"Direct to platform support","Your complaint appears in the authorized admin support inbox."],[BadgeCheck,"Booking verified fairly","We match the booking email to the selected business to protect customers and salons."],[ShieldCheck,"Anti-sabotage protection","Unverified reports receive human review but cannot automatically damage a salon score."]].map(([Icon,title,text])=><div key={title as string} className="flex gap-4 rounded-2xl bg-blush/35 p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-magenta"><Icon size={20}/></span><div><h2 className="font-semibold text-plum">{title as string}</h2><p className="mt-1 text-xs leading-5 text-ink/60">{text as string}</p></div></div>)}</div></div><ComplaintForm salons={data || []}/></section><PublicFooter/></main>;
}
