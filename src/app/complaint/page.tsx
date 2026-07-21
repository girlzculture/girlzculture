import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import ComplaintForm from "@/components/public/ComplaintForm";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getEngineList } from "@/lib/engineConfigServer";

export const dynamic = "force-dynamic";

export default async function ComplaintPage() {
  const [{ data, error },reasons] = await Promise.all([getSupabaseAdmin()
    .from("salons")
    .select("id,name,address_city,address_state")
    .in("status", ["Active", "Approved"])
    .order("name")
    .limit(1000),getEngineList("quality.complaint_reasons",["Service quality","Safety or hygiene","Appointment timing","Pricing or payment","Professional conduct","Other"],40)]);
  if (error) console.error("Complaint salon list failed", error);

  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader />
    <section className="mx-auto grid w-full max-w-[1320px] gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[.72fr_1.28fr] lg:py-12">
      <div>
        <h1 className="font-serif text-5xl leading-[.95] text-plum sm:text-6xl">Submit a Complaint</h1>
        <p className="mt-4 max-w-lg text-sm leading-7 text-ink/65">Tell us what happened. Every complaint is reviewed.</p>
        <ul className="mt-5 max-w-lg list-disc space-y-3 pl-5 text-sm leading-6 text-ink/65">
          <li>We match the booking email to the selected business to protect our customers and salons.</li>
          <li>Unverified reports receive human review but may not automatically result in an action.</li>
        </ul>
      </div>
      <ComplaintForm salons={data || []} reasons={reasons}/>
    </section>
    <PublicFooter />
  </main>;
}
