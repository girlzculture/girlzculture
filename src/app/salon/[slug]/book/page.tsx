import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import SalonBookingWizard from "@/components/SalonBookingWizard";
import { CustomerBottomNav, PublicHeader } from "@/components/site/PublicChrome";

type SalonRecord = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  address_street?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  description?: string | null;
  status?: string | null;
  is_discoverable?: boolean | null;
  subscription_status?: string | null;
};

type StyleRecord = {
  id?: string;
  salon_id?: string | null;
  name?: string | null;
  category?: string | null;
  category_id?: string | null;
  service_category?: { name?: string | null; slug?: string | null } | null;
  price_display_min?: number | null;
  price_display_max?: number | null;
  duration_min_hours?: number | null;
  duration_max_hours?: number | null;
  length_options?: unknown;
  size_options?: unknown;
  addons?: unknown;
  option_groups?: unknown;
};

type StylistRecord = {
  id?: string;
  salon_id?: string | null;
  name?: string | null;
  specialties?: string[] | null;
  bio?: string | null;
  avatar_url?: string | null;
  photos?: string[] | string | null;
  years_experience?: number | null;
  rating?: number | null;
  is_active?: boolean | null;
  is_draft?: boolean | null;
};

export default async function SalonBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = getSupabaseAdmin();

  const { data: salonRecord, error: salonError } = await admin
    .from("salons")
    .select("id,name,slug,address_street,address_line2,address_city,address_state,address_zip,description,status,is_discoverable,subscription_status")
    .eq("slug", slug)
    .maybeSingle<SalonRecord>();

  if (salonError) {
    throw salonError;
  }

  if (!salonRecord) {
    notFound();
  }

  const unavailable = salonRecord.status !== "Active" || salonRecord.is_discoverable !== true || !["active", "trialing"].includes(String(salonRecord.subscription_status || "").toLowerCase());
  if (unavailable) {
    return <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0"><PublicHeader/><section className="mx-auto grid min-h-[65vh] w-full max-w-3xl place-items-center px-4 py-16 text-center"><div className="rounded-[20px] border border-plum/10 bg-white p-8 shadow-[0_14px_45px_rgba(26,18,32,.08)]"><p className="text-xs font-bold uppercase tracking-[.12em] text-magenta">Booking unavailable</p><h1 className="mt-3 font-serif text-4xl text-plum">This salon is not accepting new bookings right now.</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink/65">The salon may have paused its listing or availability. Your existing bookings are not affected.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link href="/salons" className="inline-flex min-h-11 items-center rounded-lg bg-magenta px-5 text-sm font-bold text-white">Find another salon</Link><Link href={`/salon/${slug}`} className="inline-flex min-h-11 items-center rounded-lg border border-magenta px-5 text-sm font-bold text-magenta">Return to salon</Link></div></div></section><CustomerBottomNav active="search"/></main>;
  }

  // Internal eligibility fields are used only on the server and are never
  // serialized into the customer booking interface.
  const salonData = {
    id: salonRecord.id,
    name: salonRecord.name,
    slug: salonRecord.slug,
    address_street: salonRecord.address_street,
    address_line2: salonRecord.address_line2,
    address_city: salonRecord.address_city,
    address_state: salonRecord.address_state,
    address_zip: salonRecord.address_zip,
    description: salonRecord.description,
  };

  const { data: stylesData } = await supabase
    .from("styles")
    .select("*,service_category:service_categories(name,slug)")
    .eq("salon_id", salonData.id)
    .is("archived_at", null)
    .eq("is_active", true);

  const { data: stylistsData } = await supabase
    .from("stylists")
    .select("*")
    .eq("salon_id", salonData.id)
    .is("archived_at", null)
    .eq("is_active", true)
    .eq("is_draft", false);

  const styles = (stylesData || []) as StyleRecord[];
  const stylists = (stylistsData || []) as StylistRecord[];

  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-cream text-plum">Loading secure booking…</main>}><SalonBookingWizard salon={salonData} styles={styles} stylists={stylists} /></Suspense>;
}
