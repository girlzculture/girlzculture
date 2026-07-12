import { redirect } from "next/navigation";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") query.set(key, value);
  }
  redirect(`/salons${query.size ? `?${query.toString()}` : ""}`);
}
