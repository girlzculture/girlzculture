export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 py-16 text-ink sm:px-8 lg:px-12">
      <section className="w-full max-w-4xl rounded-[2rem] border border-ink/10 bg-cream/90 px-8 py-16 shadow-[0_20px_60px_rgba(27,18,32,0.08)] backdrop-blur sm:px-12 lg:px-16 lg:py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="mb-6 text-sm font-semibold uppercase tracking-[0.35em] text-magenta">
            Creative culture, reimagined
          </p>
          <h1 className="font-serif text-5xl font-semibold leading-[0.95] sm:text-6xl lg:text-8xl">
            <span className="block text-plum">Girlz</span>
            <span className="block text-magenta">Culture</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/80 sm:text-xl">
            A warm space for stories, style, and community that feel bold, beautiful, and unapologetically yours.
          </p>
        </div>
      </section>
    </main>
  );
}
