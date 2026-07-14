import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, CalendarDays, Scissors, Star, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SafeImage from "@/components/site/SafeImage";
import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";

type Salon = { id: string; name?: string | null; slug?: string | null; neighborhood?: string | null; address_city?: string | null; address_state?: string | null };
type Stylist = { id: string; name?: string | null; bio?: string | null; specialties?: string[] | string | null; avatar_url?: string | null; photos?: string[] | string | null; years_experience?: number | null; rating?: number | null };

function normalizeList(value: string[] | string | null | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((entry): entry is string => typeof entry === "string" && Boolean(entry));
    } catch {
      return value.split(",").map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [];
}

export default async function StylistProfilePage({ params }: { params: Promise<{ slug: string; stylistId: string }> }) {
  const { slug, stylistId } = await params;
  const { data: salon } = await supabase.from("salons").select("id,name,slug,neighborhood,address_city,address_state").eq("slug", slug).maybeSingle<Salon>();
  if (!salon) notFound();

  const { data: stylist } = await supabase.from("stylists").select("*").eq("id", stylistId).eq("salon_id", salon.id).eq("is_active", true).eq("is_draft", false).maybeSingle<Stylist>();
  if (!stylist) notFound();

  const specialties = normalizeList(stylist.specialties);
  const portfolio = normalizeList(stylist.photos);
  const experience = Number(stylist.years_experience || 0);
  const rating = Number(stylist.rating || 0);
  const location = [salon.neighborhood, salon.address_city, salon.address_state].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0">
      <PublicHeader />
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <Link href={`/salon/${slug}`} className="inline-flex items-center gap-2 text-[12px] font-semibold text-plum hover:text-magenta"><ArrowLeft size={16} />Back to {salon.name || "salon"}</Link>

        <section className="mt-5 overflow-hidden rounded-[20px] border border-plum/10 bg-white/75 shadow-[0_18px_50px_rgba(26,18,32,0.07)]">
          <div className="grid lg:grid-cols-[0.72fr_1.28fr]">
            <div className="relative min-h-[360px] bg-blush/55 sm:min-h-[480px]">
              {stylist.avatar_url ? <SafeImage src={stylist.avatar_url} fallbackSrc={stylist.avatar_url} alt={stylist.name || "Stylist"} priority className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 grid place-items-center text-plum/35"><UserRound size={104} strokeWidth={1.1} aria-hidden="true" /></span>}
            </div>
            <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-14">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-magenta">Girlz Culture Professional</p>
              <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-plum sm:text-5xl">{stylist.name || "Stylist"}</h1>
              <p className="mt-2 text-[12px] text-ink/55">{salon.name}{location ? ` · ${location}` : ""}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                {experience > 0 ? <span className="inline-flex items-center gap-2 rounded-full bg-blush/45 px-4 py-2 text-[11px] font-semibold"><BriefcaseBusiness size={15} className="text-magenta" />{experience} {experience === 1 ? "year" : "years"} experience</span> : null}
                {rating > 0 ? <span className="inline-flex items-center gap-2 rounded-full bg-blush/45 px-4 py-2 text-[11px] font-semibold"><Star size={15} className="fill-amber text-amber" />{rating.toFixed(1)} rating</span> : null}
              </div>
              {stylist.bio ? <p className="mt-6 max-w-2xl text-[14px] leading-7 text-ink/75">{stylist.bio}</p> : <p className="mt-6 text-[13px] text-ink/55">This stylist has not added a full description yet.</p>}
              {specialties.length ? <div className="mt-6"><h2 className="flex items-center gap-2 text-[12px] font-bold text-plum"><Scissors size={16} />Specialties</h2><div className="mt-3 flex flex-wrap gap-2">{specialties.map((specialty) => <span key={specialty} className="rounded-full border border-plum/10 bg-white px-3 py-2 text-[11px] text-ink/70">{specialty}</span>)}</div></div> : null}
              <Link href={`/salon/${slug}/book?stylist=${stylist.id}`} className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-magenta px-7 text-[13px] font-bold text-white shadow-[0_10px_28px_rgba(214,24,107,0.2)] hover:bg-[#bb145d]"><CalendarDays size={17} />Book with {stylist.name || "this stylist"}</Link>
            </div>
          </div>
        </section>

        <section className="py-10">
          <div><h2 className="font-serif text-3xl font-semibold text-plum">Selected Work</h2><p className="mt-2 text-[12px] text-ink/55">Portfolio photos uploaded by {stylist.name || "this stylist"}.</p></div>
          {portfolio.length ? <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{portfolio.map((photo, index) => <div key={`${photo}-${index}`} className="relative aspect-[4/5] overflow-hidden rounded-[14px] bg-blush"><SafeImage src={photo} fallbackSrc={photo} alt={`${stylist.name || "Stylist"} portfolio ${index + 1}`} className="h-full w-full object-cover" /></div>)}</div> : <div className="mt-6 rounded-[14px] border border-dashed border-plum/15 bg-white/50 p-8 text-center text-[12px] text-ink/55">Portfolio photos have not been published yet.</div>}
        </section>
      </div>
      <PublicFooter />
      <CustomerBottomNav active="home" />
    </main>
  );
}
