import { permanentRedirect } from "next/navigation";

// Match the HTTP redirect for internal rendering, preserving explicit intent.
export default async function PartnerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  permanentRedirect(`/business/signup${query.size ? `?${query}` : ""}`);
}
