import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-16 text-ink sm:px-6 lg:px-8">
      <div className="w-full max-w-xl rounded-[24px] border border-plum/10 bg-white/80 p-8 text-center shadow-[0_20px_60px_rgba(27,18,32,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Salon not found</p>
        <h1 className="mt-4 font-serif text-4xl font-semibold text-plum">This profile is still finding its way home.</h1>
        <p className="mt-4 text-lg leading-8 text-ink/80">
          The salon you requested is not available yet, or the link may need a refresh.
        </p>
        <Link href="/" className="mt-8 inline-flex rounded-full bg-magenta px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white">
          Return home
        </Link>
      </div>
    </main>
  );
}
