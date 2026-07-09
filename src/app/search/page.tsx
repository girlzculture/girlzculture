import SearchClient from "@/components/SearchClient";

export default function SearchPage() {
  return (
    <main className="min-h-screen bg-cream text-ink">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8">
        <SearchClient />
      </div>
    </main>
  );
}
