import { permanentRedirect } from "next/navigation";

// Compatibility for direct rendering and internal rewrites; next.config also
// redirects HTTP requests before rendering, preserving their complete query.
export default async function LegacyBusinessRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  permanentRedirect(`/business/apply${query.size ? `?${query}` : ""}`);
}
