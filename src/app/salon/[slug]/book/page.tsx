import { notFound } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabase";
import SalonBookingWizard from "@/components/SalonBookingWizard";

type SalonRecord = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  address_street?: string | null;
  address_line2?: string | null;
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
    .select("*,service_category:service_categories(name,slug)")
    .eq("salon_id", salonData.id);

  const { data: stylistsData } = await supabase
    .from("stylists")
    .select("*")
    .eq("salon_id", salonData.id)
    .eq("is_active", true)
    .eq("is_draft", false);

  const styles = (stylesData || []) as StyleRecord[];
  const stylists = (stylistsData || []) as StylistRecord[];

  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-cream text-plum">Loading secure booking…</main>}><SalonBookingWizard salon={salonData} styles={styles} stylists={stylists} /></Suspense>;
}
