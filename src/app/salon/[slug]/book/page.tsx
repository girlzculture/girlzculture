import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SalonBookingWizard from "@/components/SalonBookingWizard";

type SalonRecord = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  neighborhood?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  phone?: string | null;
  email?: string | null;
  description?: string | null;
};

type StyleRecord = {
  id?: string;
  salon_id?: string | null;
  name?: string | null;
  category?: string | null;
  price_display_min?: number | null;
  price_display_max?: number | null;
  duration_min_hours?: number | null;
  duration_max_hours?: number | null;
  length_options?: any | null;
  size_options?: any | null;
  addons?: any | null;
};

type StylistRecord = {
  id?: string;
  salon_id?: string | null;
  name?: string | null;
  specialties?: string[] | null;
  bio?: string | null;
  avatar_url?: string | null;
};

export default async function SalonBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: salonData, error: salonError } = await supabase
    .from("salons")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<SalonRecord>();

  if (salonError) {
    throw salonError;
  }

  if (!salonData) {
    notFound();
  }

  const { data: stylesData } = await supabase
    .from("styles")
    .select("*")
    .eq("salon_id", salonData.id);

  const { data: stylistsData } = await supabase
    .from("stylists")
    .select("*")
    .eq("salon_id", salonData.id);

  const styles = (stylesData || []) as StyleRecord[];
  const stylists = (stylistsData || []) as StylistRecord[];

  return (
    <main className="min-h-screen bg-cream px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1000px]">
        <div className="mb-8 rounded-[32px] border border-plum/10 bg-white/85 p-6 shadow-[0_20px_60px_rgba(27,18,32,0.08)] sm:p-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Book at</p>
              <h1 className="font-serif text-4xl font-semibold text-plum">{salonData.name}</h1>
              <p className="mt-2 text-sm text-ink/70">{salonData.neighborhood || "Local salon"}</p>
            </div>
            <div className="rounded-full bg-blush/60 px-4 py-2 text-sm font-semibold text-plum">Secure booking experience</div>
          </div>
          <p className="text-sm leading-7 text-ink/80">
            Choose your style, preferred stylist, and appointment time. A 10% reservation fee holds your booking and is applied toward the total service price.
          </p>
        </div>

        <SalonBookingWizard salon={salonData} styles={styles} stylists={stylists} />
      </div>
    </main>
  );
}
