import { BUSINESS_PHOTO_CATEGORIES, type BusinessPhotoMetadata } from "@/lib/businessPhotoMetadata";

/** Counts saved image references only. Never infer a photo's contents or
 * publication from a filename, and never fetch an external image to count it. */
export function businessMediaInventory(record: Record<string, unknown>, publiclyVisible: boolean | null) {
  const image = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  const gallery = [...new Set((Array.isArray(record.gallery_photos) ? record.gallery_photos : []).map(image).filter((value): value is string => value !== null))];
  const cover = image(record.cover_photo_url);
  const logo = image(record.logo_url);
  const total = new Set([...gallery, ...[cover, logo].filter((value): value is string => value !== null)]).size;
  const metadata = record.photo_metadata && typeof record.photo_metadata === "object" ? record.photo_metadata as BusinessPhotoMetadata : {};
  const categories = Object.fromEntries(Object.keys(BUSINESS_PHOTO_CATEGORIES).map(category => [category, gallery.filter(url => (metadata[url]?.category || "other") === category).length]));
  return {
    gallery_count: gallery.length,
    cover_count: cover ? 1 : 0,
    logo_count: logo ? 1 : 0,
    distinct_saved_images: total,
    categories,
    photos: gallery.slice(0, 16).map((url, index) => ({ position: index + 1, category: metadata[url]?.category || "other", title: metadata[url]?.title || "", caption: metadata[url]?.caption || "", featured: metadata[url]?.featured === true })),
    duplicate_gallery_references: Array.isArray(record.gallery_photos) ? record.gallery_photos.filter(value => image(value)).length - gallery.length : 0,
    publicly_visible: publiclyVisible,
    published_gallery_count: publiclyVisible === null ? null : publiclyVisible ? gallery.length : 0,
    scope: "current_business_saved_media",
    includes_customer_private_attachments: false,
    image_contents_inspected: false,
  };
}
