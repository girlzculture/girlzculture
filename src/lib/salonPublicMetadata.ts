import "server-only";

import type { Metadata } from "next";
import { capturePublicPageFailure } from "@/lib/publicPageMonitoring";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PublicSalonMetadataRow = {
  id: string;
  name: string | null;
  description: string | null;
  slug: string | null;
  vanity_slug: string | null;
  cover_photo_url: string | null;
  address_city: string | null;
  address_state: string | null;
};

export async function getSalonPublicMetadata(
  value: string,
  field: "slug" | "vanity_slug",
): Promise<Metadata | null> {
  try {
    const admin = getSupabaseAdmin();
    const result = await admin
      .from("salons")
      .select(
        "id,name,description,slug,vanity_slug,cover_photo_url,address_city,address_state",
      )
      .eq(field, value)
      .eq("status", "Active")
      .eq("is_discoverable", true)
      .maybeSingle<PublicSalonMetadataRow>();
    if (result.error) throw result.error;
    if (!result.data) return null;

    const salon = result.data;
    const visibility = await admin.rpc("is_salon_profile_public", {
      target_salon_id: salon.id,
    });
    if (visibility.error) throw visibility.error;
    if (visibility.data !== true) return null;

    const title = salon.name || "Salon";
    const location = [salon.address_city, salon.address_state]
      .filter(Boolean)
      .join(", ");
    const description =
      salon.description?.trim().slice(0, 260) ||
      `View transparent pricing, styles, reviews, and availability${location ? ` for ${title} in ${location}` : ` for ${title}`}.`;
    const canonical = salon.vanity_slug
      ? `/${salon.vanity_slug}`
      : `/salon/${salon.slug}`;
    const images = salon.cover_photo_url
      ? [{ url: salon.cover_photo_url, alt: `${title} salon` }]
      : undefined;

    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        type: "website",
        siteName: "Girlz Culture",
        title,
        description,
        url: canonical,
        ...(images ? { images } : {}),
      },
      twitter: {
        card: images ? "summary_large_image" : "summary",
        title,
        description,
        ...(images ? { images: images.map((image) => image.url) } : {}),
      },
    };
  } catch (error) {
    await capturePublicPageFailure(
      error,
      "salon-public-profile",
      "load-social-metadata",
    );
    return null;
  }
}
