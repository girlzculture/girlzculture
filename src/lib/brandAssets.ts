import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type PublishedBrandAsset = {
  asset_key: string;
  display_name: string;
  published_url: string | null;
  published_alt_text: string | null;
  published_focal_x: number | null;
  published_focal_y: number | null;
  published_width_px: number | null;
  published_height_px: number | null;
  published_version: number;
};

export const getPublishedBrandAssets = cache(async () => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("platform_brand_assets")
      .select("asset_key,display_name,published_url,published_alt_text,published_focal_x,published_focal_y,published_width_px,published_height_px,published_version")
      .gt("published_version", 0);
    if (error) return {} as Record<string, PublishedBrandAsset>;
    return Object.fromEntries(
      (data || []).map((asset) => [asset.asset_key, asset]),
    ) as Record<string, PublishedBrandAsset>;
  } catch {
    return {} as Record<string, PublishedBrandAsset>;
  }
});

export async function getPublishedBrandAsset(assetKey: string) {
  return (await getPublishedBrandAssets())[assetKey] || null;
}
