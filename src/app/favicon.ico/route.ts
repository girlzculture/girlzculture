import { getPublishedBrandAsset } from "@/lib/brandAssets";
import { getPublishedFaviconHref } from "@/lib/brandFavicon";

export const dynamic = "force-dynamic";

// Legacy implicit requests follow the same authority as the document metadata.
// This route does not create a competing file-based metadata icon.
export async function GET() {
  const asset = await getPublishedBrandAsset("favicon");
  return new Response(null, {
    status: 307,
    headers: {
      Location: getPublishedFaviconHref(asset),
      "Cache-Control": "no-store, max-age=0",
      "Netlify-CDN-Cache-Control": "no-store",
    },
  });
}

export const HEAD = GET;
