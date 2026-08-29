import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  BadgeCheck,
  Clock3,
  MapPin,
  Navigation,
  Package,
  ShieldCheck,
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
import SalonDistance from "@/components/public/SalonDistance";
import { getContentPage } from "@/lib/content";
import { getSalonStatusLabel, isSalonClosedToday } from "@/lib/salonOpenStatus";
import { getEngineText } from "@/lib/engineConfigServer";
import { bestPromotionForContext, promotionLabel, type SalonPromotion } from "@/lib/salonPromotions";
import { getSalonPublicMetadata } from "@/lib/salonPublicMetadata";
import ExpandableSalonDescription from "@/components/public/ExpandableSalonDescription";
import SalonRatingSummary from "@/components/public/SalonRatingSummary";
import SalonStylistFallback from "@/components/public/SalonStylistFallback";

type SalonRecord = {
  id: string;
  name?: string | null;
  is_closed_override?: boolean | null;
  closed_override_date?: string | null;
  time_zone?: string | null;
  slug?: string | null;
  description?: string | null;
  description_ai_assisted?: boolean | null;
  stylist_section_fallback?: { mode?: string; image_url?: string | null; product_id?: string | null; promotion_id?: string | null } | null;
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
  accepting_bookings?: boolean | null;
  subscription_tier?: string | null;
  vanity_slug?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  google_business_url?: string | null;
};

type StyleRecord = {
  id?: string;
  salon_id?: string | null;
  service_group_id?: string | null;
  master_style_id?: string | null;
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
  included_items?: string[] | null;
  photos?: string[] | string | null;
};

type StylistRecord = {
  id?: string;
  slug?: string | null;
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
  display_name?: string | null;
  review_title?: string | null;
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

export const dynamic = "force-dynamic";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return (
    (await getSalonPublicMetadata(slug, "slug")) || {
      title: "Salon unavailable",
      robots: { index: false, follow: false },
    }
  );
}

export default async function SalonPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = getSupabaseAdmin();
  const { slug } = await params;
  const incomingQuery = await searchParams;
  const bookingContext = new URLSearchParams();
  for (const key of ["style"] as const) {
    const value = incomingQuery[key];
    if (typeof value === "string" && value.length <= 160) bookingContext.set(key, value);
  }
  const pageContent = (await getContentPage("salon-profile", { slug: "salon-profile", title: "Salon profile", labels: {} }))
    || { slug: "salon-profile", title: "Salon profile", labels: {} };
  const { data: salon, error: salonError } = await supabase
    .from("salons")
    .select("id,name,slug,vanity_slug,instagram_url,tiktok_url,google_business_url,description,description_ai_assisted,stylist_section_fallback,address_street,address_line2,address_city,address_state,address_zip,latitude,longitude,hours,languages,logo_url,cover_photo_url,gallery_photos,verification_status,rating_overall,review_count,is_closed_override,closed_override_date,time_zone,status,is_discoverable,accepting_bookings,subscription_tier")
    .eq("slug", slug)
    .maybeSingle<SalonRecord>();

  if (salonError) throw salonError;
  if (!salon) {
    const { data: redirectRecord } = await supabase.from("salon_slug_redirects").select("new_slug").eq("route_scope", "salon").eq("old_slug", slug).is("retired_at", null).maybeSingle();
    if (redirectRecord?.new_slug) permanentRedirect(`/salon/${redirectRecord.new_slug}`);
    notFound();
  }
  const profileVisibility = await supabase.rpc("is_salon_profile_public", {
    target_salon_id: salon.id,
  });
  if (profileVisibility.error) throw profileVisibility.error;
  if (
    slug.startsWith("pending-")
    || salon.status !== "Active"
    || salon.is_discoverable !== true
    || profileVisibility.data !== true
  ) notFound();

  const now = new Date().toISOString();
  const [stylesResult, stylistsResult, reviewsResult, productsResult, promotionsResult] = await Promise.all([
    supabase.from("styles").select("id,service_group_id,master_style_id,name,price_display_min,price_display_max,duration_min_hours,duration_max_hours,base_price,size_options,length_options,addons,hair_included,included_items,photos").eq("salon_id", salon.id).is("archived_at", null).or("is_draft.is.null,is_draft.eq.false").order("created_at", { ascending: true }),
    supabase.from("stylists").select("id,slug,name,specialties,bio,avatar_url,photos,years_experience").eq("salon_id", salon.id).eq("is_active", true).eq("is_draft", false).is("archived_at", null).order("created_at", { ascending: true }),
    supabase.from("reviews").select("id,display_name,review_title,rating_overall,rating_price_accuracy,rating_punctuality,rating_quality,rating_cleanliness,would_return,written_review,result_photos,salon_reply,created_at").eq("salon_id", salon.id).eq("moderation_status", "Published").is("archived_at", null).or("dispute_status.is.null,dispute_status.neq.Removed").order("created_at", { ascending: false }),
    supabase.from("salon_products").select("id,name,description,price,photo_url").eq("salon_id", salon.id).eq("is_visible", true).eq("product_status", "Active").is("archived_at", null).order("created_at", { ascending: true }),
    supabase.from("salon_promotions").select("id,salon_id,title,description,public_headline,promotion_type,discount_value,discount_label,status,target_scope,target_ids,restrictions,starts_at,ends_at,is_active,archived_at").eq("salon_id",salon.id).eq("status","Active").eq("is_active",true).is("archived_at",null).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gte.${now}`).order("created_at",{ascending:false}),
  ]);

  const styles = (stylesResult.data || []) as StyleRecord[];
  const stylists = (stylistsResult.data || []) as StylistRecord[];
  const products = (productsResult.data || []) as ProductRecord[];
  const promotions = ["Growth","Premium"].includes(String(salon.subscription_tier || "")) ? (promotionsResult.data || []) as SalonPromotion[] : [];
  const promotionCards = promotions.map((promotion) => {
    const eligibleStyles = styles.filter((style) => bestPromotionForContext([promotion], {
      salonId: salon.id,
      styleId: style.id || null,
      serviceGroupId: style.service_group_id,
      masterStyleId: style.master_style_id,
      basePrice: Number(style.base_price || style.price_display_min || 0),
      selectedAddons: [],
      subtotal: Number(style.price_display_min || style.base_price || 0),
    }));
    const eligibleProducts = products.filter((product) => bestPromotionForContext([promotion], {
      salonId: salon.id,
      productId: product.id || null,
      basePrice: Number(product.price || 0),
      selectedAddons: [],
      subtotal: Number(product.price || 0),
    }));
    const primaryStyle = eligibleStyles[0];
    const primaryProduct = eligibleProducts[0];
    const href = primaryStyle?.id
      ? `/salon/${salon.slug || slug}/book?style=${encodeURIComponent(primaryStyle.id)}&promotion=${encodeURIComponent(String(promotion.id || ""))}`
      : primaryProduct?.id
        ? `/salon/${salon.slug || slug}/product/${primaryProduct.id}?promotion=${encodeURIComponent(String(promotion.id || ""))}`
        : `/salon/${salon.slug || slug}`;
    return { promotion, eligibleStyles, eligibleProducts, href };
  }).filter((entry) => entry.eligibleStyles.length || entry.eligibleProducts.length);

  const reviews = reviewsResult.error
    ? []
    : (reviewsResult.data || []) as ReviewRecord[];

  const styleIds = styles.map((style) => style.id).filter((id): id is string => Boolean(id));
  const styleMaterialsByStyleId: Record<string, StyleMaterialRecord[]> = {};
  if (styleIds.length) {
    const { data: materialsData } = await supabase.from("style_materials").select("id,style_id,name,price,longevity,quality_note").in("style_id", styleIds);
    for (const material of (materialsData || []) as StyleMaterialRecord[]) {
      if (!material.style_id) continue;
      styleMaterialsByStyleId[material.style_id] = [...(styleMaterialsByStyleId[material.style_id] || []), material];
    }
  }

  const rating = typeof salon.rating_overall === "number" ? salon.rating_overall : 0;
  const closedToday = isSalonClosedToday(salon);
  const acceptingBookings = salon.accepting_bookings !== false;
  const canBook = acceptingBookings && !closedToday;
  const statusLabel = !acceptingBookings
    ? "Bookings paused"
    : getSalonStatusLabel(salon);
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
  const stylistFallback = salon.stylist_section_fallback || { mode: "empty" };
  const canShowStylistFallback = !stylists.length && ["Growth", "Premium"].includes(String(salon.subscription_tier || ""));

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
            <div className="flex flex-wrap gap-2"><span className="inline-flex items-center gap-2 rounded-full bg-blush px-3 py-1.5 text-[9px] font-semibold text-ink"><BadgeCheck size={14} className="text-amber" />{isVerified ? verifiedLabel : "Salon Profile"}</span><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[9px] font-bold ${closedToday?"bg-red-100 gc-text-danger":"bg-blush/55 text-plum"}`}><Clock3 size={14}/>{statusLabel}</span></div>
            <h1 className="mt-3 font-serif text-[36px] font-semibold leading-[0.95] tracking-[-0.04em] text-charcoal sm:text-[48px] xl:text-[54px]">{salon.name || "Salon profile"}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink/70"><MapPin size={15} className="text-plum" /><span>{locationLine}</span><SalonDistance latitude={salon.latitude} longitude={salon.longitude}/></div>
            <SalonRatingSummary rating={rating} reviewCount={reviewCount} />

            {trustLabels.length ? <div className="mt-4 grid grid-cols-3 gap-2">
              {trustLabels.map((label, index) => {
                const Icon = trustIcons[index] || ShieldCheck;
                return (
                  <div key={label} className="flex min-h-[58px] items-center gap-2 rounded-[11px] border border-plum/10 bg-white/65 px-2.5 py-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blush text-amber"><Icon size={16} /></span>
                    <span className="min-w-0 text-[9px] font-semibold leading-tight text-ink">{label}</span>
                  </div>
                );
              })}
            </div> : null}

            {salon.description?.trim() ? <ExpandableSalonDescription description={salon.description} aiAssisted={salon.description_ai_assisted === true} /> : null}

            <div className="mt-4 flex items-center gap-2">
              {canBook ? <Link href={`/salon/${salon.slug || slug}/book${bookingContext.size ? `?${bookingContext}` : ""}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[9px] bg-magenta px-6 text-[12px] font-semibold text-white shadow-[0_9px_22px_rgba(0,131,166,0.18)] transition hover:bg-primary-hover">Book Appointment</Link> : <span aria-disabled="true" data-visual-state="disabled" className="gc-state-disabled inline-flex min-h-11 flex-1 items-center justify-center rounded-[9px] border px-6 text-[12px] font-semibold">{closedToday ? "Closed today" : "Bookings paused"}</span>}
              <SalonProfileActions
                salonId={salon.id}
                salonName={salon.name || "Salon"}
                salonSlug={salon.slug || slug}
                vanitySlug={salon.vanity_slug}
                instagramUrl={salon.instagram_url}
                tiktokUrl={salon.tiktok_url}
                googleBusinessUrl={salon.google_business_url}
              />
            </div>
          </div>
        </section>

        {promotionCards.length ? (
          <section aria-labelledby="current-offers" className="mb-4 rounded-[13px] border border-magenta/20 bg-[linear-gradient(105deg,rgba(245,247,248,.62),rgba(255,255,255,.78))] p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="current-offers" className="flex items-center gap-2 font-serif text-lg font-semibold text-plum"><Tag size={15} className="text-magenta"/>Current Offers</h2><p className="text-[10px] text-ink/55">Eligible services and products only</p></div>
            <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
              {promotionCards.map(({ promotion, eligibleStyles, eligibleProducts, href }) => (
                <article key={promotion.id} className="min-w-[82vw] max-w-[360px] snap-start rounded-[11px] border border-plum/10 bg-white/80 p-3 sm:min-w-[310px] lg:min-w-0 lg:max-w-none">
                  <h3 className="font-serif text-base font-semibold text-plum">{promotion.public_headline || promotion.title}</h3>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-ink/65">{promotion.description || promotionLabel(promotion)}</p>
                  <p className="mt-2 text-[10px] font-bold text-magenta">{promotionLabel(promotion)}{(promotion.restrictions as Record<string,unknown> | null)?.terms ? ` · ${String((promotion.restrictions as Record<string,unknown>).terms)}` : ""}</p>
                  <p className="mt-2 line-clamp-1 text-[10px] leading-5 text-ink/60"><b>Eligible:</b> {[...eligibleStyles.map((item) => item.name), ...eligibleProducts.map((item) => item.name)].filter(Boolean).join(", ")}</p>
                  <Link href={href} className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-magenta px-3 text-[10px] font-bold text-white">{eligibleStyles.length ? "Book this offer" : "View product offer"}</Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 border-t border-plum/10 py-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="min-w-0 rounded-[12px] border border-plum/10 bg-white/65 p-4 sm:p-5">
            <h2 className="font-serif text-[22px] font-semibold text-ink">Styles & Pricing</h2>
            <p className="mt-1 text-[9px] text-ink/55">Select a style to see full pricing and time details.</p>
            <div className="mt-3"><SalonStyles styles={styles} styleMaterialsByStyleId={styleMaterialsByStyleId} salonSlug={salon.slug || slug} salonId={salon.id} promotions={promotions} /></div>
          </div>

          <div className="min-w-0 rounded-[12px] border border-plum/10 bg-white/65 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-[22px] font-semibold text-ink">{canShowStylistFallback && stylistFallback.mode !== "empty" ? "Salon Highlight" : "Our Stylists"}</h2><p className="mt-1 text-[9px] text-ink/55">{canShowStylistFallback && stylistFallback.mode !== "empty" ? "Selected by this salon for its public page." : "Meet the pros behind your perfect style."}</p></div>{stylists.length ? <a href="#stylists" className="text-[9px] font-semibold text-magenta">View all</a> : null}</div>
            <div id="stylists" className="mt-4">{canShowStylistFallback && stylistFallback.mode !== "empty" ? <SalonStylistFallback fallback={stylistFallback} products={products} promotions={promotions} salonSlug={salon.slug || slug} /> : <SalonStylists stylists={stylists} salonSlug={salon.slug || slug} />}</div>
          </div>
        </section>

        <div className="mb-4"><SalonReviews reviews={reviews} salonRating={rating} salonReviewCount={reviewCount} /></div>

        {products.length ? (
          <section id="products" className="mb-4 rounded-[15px] border border-plum/10 bg-white/65 p-4 sm:p-5">
            <div className="flex items-end justify-between gap-3"><div><h2 className="flex items-center gap-2 font-serif text-[24px] font-semibold text-ink"><Package size={21} className="text-magenta" />Our Products</h2><p className="mt-1 text-[11px] text-ink/55">Explore products available for in-person purchase at your appointment.</p></div><span className="hidden text-[10px] font-semibold text-plum sm:block">No online checkout</span></div>
            <div className="mt-5 -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-3 xl:grid-cols-4 [&::-webkit-scrollbar]:hidden">
              {products.map((product, index) => {
                const offer = bestPromotionForContext(promotions, { salonId: salon.id, productId: product.id || null, basePrice: Number(product.price || 0), selectedAddons: [], subtotal: Number(product.price || 0) });
                return <Link key={product.id || index} href={`/salon/${salon.slug || slug}/product/${product.id}${offer ? `?promotion=${encodeURIComponent(String(offer.promotion.id || ""))}` : ""}`} className="group min-w-[72vw] max-w-[300px] snap-start overflow-hidden rounded-[13px] border border-plum/10 bg-white shadow-[0_7px_20px_rgba(13,17,20,0.05)] transition hover:-translate-y-0.5 hover:border-magenta/30 sm:min-w-0 sm:max-w-none">
                  <div className="relative aspect-square w-full bg-blush/45">{product.photo_url ? <SafeImage src={product.photo_url} fallbackSrc={product.photo_url} alt={product.name || "Salon product"} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <span className="grid h-full place-items-center text-plum/30"><Package size={48} strokeWidth={1.2} /></span>}{offer ? <span className="absolute bottom-2 left-2 rounded-full bg-amber px-2 py-1 text-[9px] font-bold text-ink">{promotionLabel(offer.promotion)}</span> : null}</div>
                  <div className="p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-serif text-[19px] font-semibold leading-tight text-ink">{product.name}</h3><p className="shrink-0 text-right text-[13px] font-bold">{offer ? <><span className="block text-[10px] gc-text-secondary line-through">${Number(product.price || 0).toFixed(2)}</span><span className="text-magenta">${offer.price.total.toFixed(2)}</span></> : `$${Number(product.price || 0).toFixed(2)}`}</p></div><p className="mt-2 line-clamp-2 text-[11px] leading-5 text-ink/55">{product.description || "Available at the salon."}</p><p className="mt-3 text-[11px] font-bold text-magenta">{offer ? "View product offer" : "View product details"}</p></div>
                </Link>;
              })}
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
