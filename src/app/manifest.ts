import type { MetadataRoute } from "next";
import { getPublishedBrandAssets } from "@/lib/brandAssets";
import { getEngineBrandTheme } from "@/lib/engineConfigServer";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [assets, theme] = await Promise.all([
    getPublishedBrandAssets(),
    getEngineBrandTheme(),
  ]);
  const appIcon = assets.app_icon?.published_url;
  return {
    id: "/",
    name: "Girlz Culture — Beauty Booking",
    short_name: "Girlz Culture",
    description: "Discover trusted beauty professionals, compare transparent prices, and book with confidence.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: theme.page,
    theme_color: theme.primary,
    orientation: "portrait-primary",
    categories: ["beauty", "lifestyle", "shopping"],
    icons: [
      ...(appIcon
        ? [{ src: appIcon, sizes: "512x512", type: "image/png", purpose: "any" as const }]
        : [{ src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" as const }]),
      { src: "/pwa-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
