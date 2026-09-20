export const BUSINESS_PHOTO_LAYOUT_COPY = {
  en: { tools: "Photo tools" },
  fr: { tools: "Outils photo" },
  es: { tools: "Herramientas" },
  "zh-CN": { tools: "照片工具" },
} as const;
export function businessPhotoLayoutCopy(locale: string) { return BUSINESS_PHOTO_LAYOUT_COPY[locale as keyof typeof BUSINESS_PHOTO_LAYOUT_COPY] || BUSINESS_PHOTO_LAYOUT_COPY.en; }
