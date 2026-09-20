export const BUSINESS_PHOTO_CATEGORIES = { services: "Services", before_after: "Before & After", space: "Salon Space", team: "Team", client_love: "Client Love", other: "Other" } as const;
export type BusinessPhotoCategory = keyof typeof BUSINESS_PHOTO_CATEGORIES;
export type BusinessPhotoDetails = { category: BusinessPhotoCategory; title: string; caption: string; featured: boolean; source_locale: string };
export type BusinessPhotoMetadata = Record<string, BusinessPhotoDetails>;

export function defaultPhotoDetails(category: BusinessPhotoCategory = "other", locale = "en"): BusinessPhotoDetails {
  return { category, title: "", caption: "", featured: false, source_locale: locale };
}
export function validatePhotoDetails(value: unknown): BusinessPhotoDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PHOTO_INVALID");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 5 || Object.keys(row).some(key => !["category", "title", "caption", "featured", "source_locale"].includes(key)) || typeof row.category !== "string" || !Object.hasOwn(BUSINESS_PHOTO_CATEGORIES, row.category) || typeof row.title !== "string" || row.title.length > 120 || typeof row.caption !== "string" || row.caption.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(row.title + row.caption) || typeof row.featured !== "boolean" || !["en", "fr", "es", "zh-CN", "wo"].includes(String(row.source_locale))) throw new Error("PHOTO_INVALID");
  return { category: row.category as BusinessPhotoCategory, title: row.title, caption: row.caption, featured: row.featured, source_locale: String(row.source_locale) };
}
export function publicGalleryPhotos(gallery: unknown) {
  const urls = [...new Set((Array.isArray(gallery) ? gallery : []).filter((item): item is string => typeof item === "string" && Boolean(item.trim())))];
  return urls;
}
