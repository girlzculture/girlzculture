export default function Loading() {
  return (
    <main className="min-h-screen bg-cream px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="animate-pulse rounded-[24px] border border-plum/10 bg-white/80 p-6 shadow-sm sm:p-8 lg:p-10">
          <div className="h-4 w-32 rounded-full bg-plum/10" />
          <div className="mt-4 h-10 w-3/4 rounded-full bg-plum/10" />
          <div className="mt-5 h-4 w-2/3 rounded-full bg-plum/10" />
          <div className="mt-10 h-24 rounded-[20px] bg-cream/80" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-48 animate-pulse rounded-[24px] border border-plum/10 bg-white/80" />
          <div className="h-48 animate-pulse rounded-[24px] border border-plum/10 bg-blush/70" />
        </div>
      </div>
    </main>
  );
}
