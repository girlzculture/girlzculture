import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  BadgeCheck,
  Clock3,
  MapPin,
  Navigation,
  Package,
  ShieldCheck,
  Star,
  Tag,
} from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import SalonReviews from "@/components/SalonReviews";
import SalonStyles from "@/components/SalonStyles";
import SalonStylists from "@/components/SalonStylists";
import { CustomerBottomNav, PublicHeader } from "@/components/site/PublicChrome";
import SafeImage from "@/components/site/SafeImage";
import SalonProfileActions from "@/components/site/SalonProfileActions";
import SalonPhotoGallery from "@/components/public/SalonPhotoGallery";
import { getContentPage } from "@/lib/content";
import { getSalonStatusLabel, isSalonClosedToday } from "@/lib/salonOpenStatus";
import { getEngineText } from "@/lib/engineConfigServer";

type SalonRecord = {
  id: string;
  name?: string | null;
  is_closed_override?: boolean | null;
  closed_override_date?: string | null;
  time_zone?: string | null;
  slug?: string | null;
  description?: string | null;
  address_street?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  hours?: unknown;
  languages?: string[] | string | null;
  logo_url?: string | null;
  cover_photo_url?: string | null;
  gallery_photos?: string[] | string | null;
  verification_status?: string | null;
  rating_overall?: number | null;
  review_count?: number | null;
  status?: string | null;
  is_discoverable?: boolean | null;
};

type StyleRecord = {
  id?: string;
  salon_id?: string | null;
  name?: string | null;
  price_display_min?: number | null;
  price_display_max?: number | null;
  duration_min_hours?: number | null;
  duration_max_hours?: number | null;
  base_price?: number | null;
  workmanship_base_price?: number | null;
  length_options?: unknown;
  size_options?: unknown;
  material_options?: unknown;
  addons?: unknown;
  hair_included?: boolean | null;
  photos?: string[] | string | null;
};

type StylistRecord = {
  id?: string;
  name?: string | null;
  specialties?: string[] | string | null;
  bio?: string | null;
  avatar_url?: string | null;
  photos?: string[] | string | null;
  is_active?: boolean | null;
  is_draft?: boolean | null;
  years_experience?: number | null;
  rating?: number | null;
};

type StyleMaterialRecord = {
  id?: string;
  style_id?: string | null;
  name?: string | null;
  price?: number | null;
  longevity?: string | null;
  quality_note?: string | null;
};

type ReviewRecord = {
  id?: string;
  rating_overall?: number | null;
  rating_price_accuracy?: number | null;
  rating_punctuality?: number | null;
  rating_quality?: number | null;
  rating_cleanliness?: number | null;
  would_return?: boolean | null;
  written_review?: string | null;
  result_photos?: string[] | null;
  salon_reply?: string | null;
  created_at?: string | null;
  customer?: { name?: string | null } | null;
};

type ProductRecord = {
  id?: string;
  name?: string | null;
  description?: string | null;
  price?: number | null;
  photo_url?: string | null;
  is_visible?: boolean | null;
};

const dayLabels = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
] as const;

function normalizeStringArray(value: string[] | string | null | undefined) {
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

function formatClock(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minutes = match[2];
  return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
}

function normalizeHours(value: unknown) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }

  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  return dayLabels.map(([key, label]) => {
    const slot = record[key] ?? record[label];
    if (Array.isArray(slot) && slot.length >= 2 && typeof slot[0] === "string" && typeof slot[1] === "string") {
      return { label, hours: `${formatClock(slot[0])} – ${formatClock(slot[1])}` };
    }
    if (slot && typeof slot === "object" && !Array.isArray(slot)) {
      const structured = slot as Record<string, unknown>;
      if (structured.closed === true) return { label, hours: "Closed" };
      if (typeof structured.open === "string" && typeof structured.close === "string") {
        return { label, hours: `${formatClock(structured.open)} – ${formatClock(structured.close)}` };
      }
    }
    if (typeof slot === "string" && slot.trim()) return { label, hours: slot };
    return { label, hours: "Contact salon" };
  });
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} className={index < Math.round(rating) ? "fill-amber text-amber" : "fill-transparent text-ink/20"} />);
}

export default async function SalonPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = getSupabaseAdmin();
  const { slug } = await params;
  const incomingQuery = await searchParams;
  const bookingContext = new URLSearchParams();
  for (const key of ["location", "lat", "lng", "style"] as const) {
    const value = incomingQuery[key];
    if (typeof value === "string" && value.length <= 160) bookingContext.set(key, value);
  }
  const pageContent = await getContentPage("salon-profile", { slug: "salon-profile", title: "Salon profile", labels: {} });
  const { data: salon, error: salonError } = await supabase
    .from("salons")
    .select("id,name,slug,description,address_street,address_line2,address_city,address_state,address_zip,latitude,longitude,hours,languages,logo_url,cover_photo_url,gallery_photos,verification_status,rating_overall,review_count,is_closed_override,closed_override_date,time_zone,status,is_discoverable")
    .eq("slug", slug)
    .maybeSingle<SalonRecord>();

  if (salonError) throw salonError;
  if (!salon) {
    const { data: redirectRecord } = await supabase.from("salon_slug_redirects").select("new_slug").eq("old_slug", slug).is("retired_at", null).maybeSingle();
    if (redirectRecord?.new_slug) permanentRedirect(`/salon/${redirectRecord.new_slug}`);
    notFound();
  }
  if (slug.startsWith("pending-") || salon.status !== "Active" || salon.is_discoverable !== true) notFound();

  const [stylesResult, stylistsResult, reviewsWithCustomerResult, productsResult] = await Promise.all([
    supabase.from("styles").select("*").eq("salon_id", salon.id).is("archived_at", null).or("is_draft.is.null,is_draft.eq.false").order("created_at", { ascending: true }),
    supabase.from("stylists").select("*").eq("salon_id", salon.id).is("archived_at", null).order("created_at", { ascending: true }),
    supabase.from("reviews").select("*, customer:customers(name)").eq("salon_id", salon.id).is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("salon_products").select("*").eq("salon_id", salon.id).eq("is_visible", true).order("created_at", { ascending: true }),
  ]);

  const styles = (stylesResult.data || []) as StyleRecord[];
  const stylists = ((stylistsResult.data || []) as StylistRecord[]).filter((stylist) => stylist.is_active !== false && stylist.is_draft !== true);
  const products = (productsResult.data || []) as ProductRecord[];

  let reviews = (reviewsWithCustomerResult.data || []) as ReviewRecord[];
  if (reviewsWithCustomerResult.error) {
    const { data: reviewsData } = await supabase.from("reviews").select("*").eq("salon_id", salon.id).is("archived_at", null).order("created_at", { ascending: false });
    reviews = (reviewsData || []) as ReviewRecord[];
  }

  const styleIds = styles.map((style) => style.id).filter((id): id is string => Boolean(id));
  const styleMaterialsByStyleId: Record<string, StyleMaterialRecord[]> = {};
  if (styleIds.length) {
    const { data: materialsData } = await supabase.from("style_materials").select("*").in("style_id", styleIds);
    for (const material of (materialsData || []) as StyleMaterialRecord[]) {
      if (!material.style_id) continue;
      styleMaterialsByStyleId[material.style_id] = [...(styleMaterialsByStyleId[material.style_id] || []), material];
    }
  }

  const rating = typeof salon.rating_overall === "number" ? salon.rating_overall : 0;
  const closedToday = isSalonClosedToday(salon);
  const statusLabel = getSalonStatusLabel(salon);
  const reviewCount = typeof salon.review_count === "number" ? salon.review_count : reviews.length;
  const uploadedGallery = [salon.cover_photo_url, ...normalizeStringArray(salon.gallery_photos)].filter((photo): photo is string => Boolean(photo));
  const locationLine = [salon.address_city, salon.address_state].filter(Boolean).join(", ") || "Location coming soon";
  const addressLine = [salon.address_street, salon.address_line2, salon.address_city, salon.address_state, salon.address_zip].filter(Boolean).join(", ") || "Address coming soon";
  const mapQuery = salon.latitude != null && salon.longitude != null ? `${salon.latitude},${salon.longitude}` : addressLine;
  const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
  const hours = normalizeHours(salon.hours);
  const isVerified = salon.verification_status?.toLowerCase().startsWith("verified") ?? false;
  const verifiedLabel=await getEngineText("trust.verified_label","Verified Salon",60);

  const trustIcons = [ShieldCheck, Tag, Clock3];
  const trustLabels = [pageContent.labels?.trust_label_1, pageContent.labels?.trust_label_2, pageContent.labels?.trust_label_3].filter(Boolean) as string[];

  return (
    <main className="min-h-screen overflow-x-clip bg-cream pb-20 text-ink md:pb-0">
      <PublicHeader />

      <div className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-10 xl:px-12 2xl:px-16">
        <nav aria-label="Breadcrumb" className="hidden items-center gap-2 py-4 text-[10px] text-ink/55 md:flex">
          <Link href="/" className="hover:text-magenta">Home</Link><span>›</span><Link href="/search" className="hover:text-magenta">Salons</Link><span>›</span><span className="text-ink/75">{salon.name || "Salon"}</span>
        </nav>

        <section className="grid gap-5 pb-5 pt-3 md:pt-0 lg:grid-cols-[0.92fr_1.08fr] lg:gap-8">
          <SalonPhotoGallery photos={uploadedGallery} salonName={salon.name || "Salon"} />

          <div className="flex flex-col justify-center lg:py-1">
            {salon.logo_url ? <SafeImage src={salon.logo_url} fallbackSrc={salon.logo_url} alt={`${salon.name || "Salon"} logo`} className="mb-3 h-16 w-16 rounded-[14px] border border-plum/10 bg-white object-cover shadow-sm" /> : null}
            <div className="flex flex-wrap gap-2"><span className="inline-flex items-center gap-2 rounded-full bg-[#f7e7df] px-3 py-1.5 text-[9px] font-semibold text-ink"><BadgeCheck size={14} className="text-amber" />{isVerified ? verifiedLabel : "Salon Profile"}</span><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[9px] font-bold ${closedToday?"bg-red-100 text-red-700":"bg-blush/55 text-plum"}`}><Clock3 size={14}/>{statusLabel}</span></div>
            <h1 className="mt-3 font-serif text-[36px] font-semibold leading-[0.95] tracking-[-0.04em] text-[#2d1237] sm:text-[48px] xl:text-[54px]">{salon.name || "Salon profile"}</h1>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-ink/70"><MapPin size={15} className="text-plum" /><span>{locationLine}</span></div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">{reviewCount > 0 && rating > 0 ? <><Star size={15} className="fill-amber text-amber" /><strong>{rating.toFixed(1)}</strong><span className="flex gap-0.5">{renderStars(rating)}</span><span className="text-ink/55">({reviewCount} reviews)</span></> : <span className="rounded-full bg-blush px-2.5 py-1 font-bold text-plum">New</span>}</div>

            {trustLabels.length ? <div className="mt-4 grid grid-cols-3 gap-2">
              {trustLabels.map((label, index) => {
                const Icon = trustIcons[index] || ShieldCheck;
                return (
                  <div key={label} className="flex min-h-[58px] items-center gap-2 rounded-[11px] border border-plum/10 bg-white/65 px-2.5 py-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f9ece5] text-amber"><Icon size={16} /></span>
                    <span className="min-w-0 text-[9px] font-semibold leading-tight text-ink">{label}</span>
                  </div>
                );
              })}
            </div> : null}

            {salon.description?.trim() ? <p className="mt-4 max-w-[760px] text-[11px] leading-[1.55] text-ink/75 sm:text-[12px]">{salon.description}</p> : null}

            <div className="mt-4 flex items-center gap-2">
              <Link href={`/salon/${salon.slug || slug}/book${bookingContext.size ? `?${bookingContext}` : ""}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[9px] bg-magenta px-6 text-[12px] font-semibold text-white shadow-[0_9px_22px_rgba(214,24,107,0.18)] transition hover:bg-[#bb145d]">Book Appointment</Link>
              <SalonProfileActions salonId={salon.id} salonName={salon.name || "Salon"} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-t border-plum/10 py-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="min-w-0 rounded-[12px] border border-plum/10 bg-white/65 p-4 sm:p-5">
            <h2 className="font-serif text-[22px] font-semibold text-ink">Styles & Pricing</h2>
            <p className="mt-1 text-[9px] text-ink/55">Select a style to see full pricing and time details.</p>
            <div className="mt-3"><SalonStyles styles={styles} styleMaterialsByStyleId={styleMaterialsByStyleId} salonSlug={salon.slug || slug} /></div>
          </div>

          <div className="min-w-0 rounded-[12px] border border-plum/10 bg-white/65 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-[22px] font-semibold text-ink">Our Stylists</h2><p className="mt-1 text-[9px] text-ink/55">Meet the pros behind your perfect style.</p></div><a href="#stylists" className="text-[9px] font-semibold text-magenta">View all</a></div>
            <div id="stylists" className="mt-4"><SalonStylists stylists={stylists} salonSlug={salon.slug || slug} /></div>
          </div>
        </section>

        <div className="mb-4"><SalonReviews reviews={reviews} salonRating={rating} salonReviewCount={reviewCount} /></div>

        {products.length ? (
          <section id="products" className="mb-4 rounded-[15px] border border-plum/10 bg-white/65 p-4 sm:p-5">
            <div className="flex items-end justify-between gap-3"><div><h2 className="flex items-center gap-2 font-serif text-[24px] font-semibold text-ink"><Package size={21} className="text-magenta" />Our Products</h2><p className="mt-1 text-[11px] text-ink/55">Explore products available for in-person purchase at your appointment.</p></div><span className="hidden text-[10px] font-semibold text-plum sm:block">No online checkout</span></div>
            <div className="mt-5 -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-3 xl:grid-cols-4 [&::-webkit-scrollbar]:hidden">
              {products.map((product, index) => (
                <Link key={product.id || index} href={`/salon/${salon.slug || slug}/product/${product.id}`} className="group min-w-[72vw] max-w-[300px] snap-start overflow-hidden rounded-[13px] border border-plum/10 bg-white shadow-[0_7px_20px_rgba(26,18,32,0.05)] transition hover:-translate-y-0.5 hover:border-magenta/30 sm:min-w-0 sm:max-w-none">
                  <div className="relative aspect-[4/3] w-full bg-blush/45">{product.photo_url ? <SafeImage src={product.photo_url} fallbackSrc={product.photo_url} alt={product.name || "Salon product"} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <span className="grid h-full place-items-center text-plum/30"><Package size={48} strokeWidth={1.2} /></span>}</div>
                  <div className="p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-serif text-[19px] font-semibold leading-tight text-ink">{product.name}</h3><p className="shrink-0 text-[13px] font-bold">${Number(product.price || 0).toFixed(2)}</p></div><p className="mt-2 line-clamp-2 text-[11px] leading-5 text-ink/55">{product.description || "Available at the salon."}</p><p className="mt-3 text-[11px] font-bold text-magenta">View product details</p></div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mb-5 grid gap-5 rounded-[12px] border border-plum/10 bg-white/65 p-4 sm:p-5 lg:grid-cols-[0.92fr_0.82fr_1.35fr]">
          <div>
            <h2 className="flex items-center gap-2 text-[11px] font-semibold text-plum"><Clock3 size={17} />Hours</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-[9px]">
              {hours.map((day) => <div key={day.label} className="grid grid-cols-[28px_1fr] gap-2"><span className="font-medium text-ink/65">{day.label}</span><span className="text-ink/55">{day.hours}</span></div>)}
            </div>
          </div>

          <div className="border-plum/10 lg:border-l lg:pl-5">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold text-plum"><MapPin size={17} />Address</h2>
            <p className="mt-3 text-[10px] font-medium leading-5 text-ink/75">{salon.address_street || "Address coming soon"}{salon.address_line2 ? <><br />{salon.address_line2}</> : null}<br />{[salon.address_city, salon.address_state, salon.address_zip].filter(Boolean).join(" ")}</p>
            <p className="mt-1 text-[9px] text-ink/45">Directions available</p>
            <a href={directionsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-8 w-full items-center justify-center gap-2 rounded-[7px] border border-magenta/25 bg-blush/25 px-4 text-[9px] font-semibold text-magenta">Get Directions <Navigation size={12} /></a>
          </div>

          <div className="relative min-h-[190px] overflow-hidden rounded-[10px] border border-plum/10 bg-blush/35">
            <iframe title={`${salon.name || "Salon"} location map`} src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="absolute inset-0 h-full w-full border-0" />
          </div>
        </section>
      </div>

      <CustomerBottomNav active="home" />
    </main>
  );
}
