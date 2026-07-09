import { supabase } from "@/lib/supabase";

type Salon = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  neighborhood?: string | null;
  rating_overall?: number | null;
  review_count?: number | null;
};

type Style = {
  salon_id?: string | null;
  price_display_min?: number | null;
};

export default async function Home() {
  const { data: salonsData, error: salonsError } = await supabase.from("salons").select("*").limit(8);

  if (salonsError) console.error("Supabase salons fetch error:", salonsError);

  const salons = (salonsData || []) as Salon[];

  const salonIds = salons.map((s) => s.id).filter(Boolean) as string[];

  let startingMap: Record<string, number | null> = {};

  if (salonIds.length > 0) {
    const { data: stylesData } = await supabase
      .from("styles")
      .select("salon_id, price_display_min")
      .in("salon_id", salonIds) as { data?: Style[] };

    const styles = stylesData || [];
    startingMap = salonIds.reduce((acc, id) => {
      const prices = styles.filter((st) => st.salon_id === id).map((s) => s.price_display_min).filter(Boolean) as number[];
      acc[id] = prices.length ? Math.min(...prices) : null;
      return acc;
    }, {} as Record<string, number | null>);
  }

  return (
    <main className="min-h-screen bg-cream text-ink">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8">
        {/* Top nav */}
        <header className="mb-8 flex w-full items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-baseline gap-2">
              <span className="font-serif text-2xl font-semibold text-plum">Girlz</span>
              <span className="font-serif text-2xl font-semibold text-magenta">Culture</span>
            </a>

            <nav className="hidden gap-6 text-sm font-medium md:flex">
              <a className="text-ink/80 hover:text-plum">Browse Styles</a>
              <a className="text-ink/80 hover:text-plum">Find Salons</a>
              <a className="text-ink/80 hover:text-plum">How It Works</a>
              <a className="text-ink/80 hover:text-plum">For Professionals</a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button className="hidden rounded-full px-4 py-2 text-sm font-medium text-plum md:inline-block">Log in</button>
            <button className="rounded-full bg-magenta px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(214,24,107,0.18)]">Sign up</button>
          </div>
        </header>

        {/* Hero */}
        <section className="mb-10 grid gap-6 md:grid-cols-2 md:items-center">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-ink/70">REAL PRICES. REAL REVIEWS. REAL WORK.</p>
            <h1 className="font-serif mb-4 text-4xl font-semibold leading-tight text-plum sm:text-5xl">Book with Confidence.</h1>
            <p className="mb-6 max-w-xl text-lg text-ink/80">The beauty booking marketplace for braided styles. Real salons. Real people. Real results.</p>

            <div className="space-y-3">
              <div className="flex w-full gap-3">
                <input aria-label="style" placeholder="What style are you looking for?" className="flex-1 rounded-full border border-ink/10 bg-white px-4 py-3 text-sm shadow-sm" />
                <input aria-label="where" placeholder="Where? (neighborhood, city, or zip)" className="w-44 rounded-full border border-ink/10 bg-white px-4 py-3 text-sm shadow-sm" />
                <button className="rounded-full bg-magenta px-5 py-3 text-sm font-semibold text-white">Search</button>
              </div>

              <div className="mt-1 text-sm text-ink/70">Popular searches:
                <span className="ml-3 mr-2 inline-block rounded-full bg-blush px-3 py-1 text-xs font-medium text-plum">Knotless Braids</span>
                <span className="mr-2 inline-block rounded-full bg-blush px-3 py-1 text-xs font-medium text-plum">Box Braids</span>
                <span className="mr-2 inline-block rounded-full bg-blush px-3 py-1 text-xs font-medium text-plum">Cornrows</span>
                <span className="inline-block rounded-full bg-blush px-3 py-1 text-xs font-medium text-plum">Locs</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex">
            <div className="ml-auto h-72 w-full max-w-[520px] rounded-lg bg-[url('/hero-placeholder.jpg')] bg-cover bg-center shadow-sm" />
          </div>
        </section>

        {/* Browse by Style */}
        <section className="mb-10">
          <h2 className="font-serif mb-4 text-2xl text-plum">Browse by Style</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              "Knotless Braids",
              "Box Braids",
              "Cornrows",
              "Locs",
            ].map((name) => (
              <div key={name} className="rounded-lg border border-plum/8 bg-white p-4 text-center shadow-sm">
                <div className="mb-3 h-28 w-full rounded-md bg-cream/60" />
                <div className="font-medium text-plum">{name}</div>
              </div>
            ))}

            <div className="rounded-lg border border-plum/8 bg-blush/60 p-4 text-center shadow-sm">
              <div className="mb-3 h-28 w-full rounded-md bg-cream/60 flex items-center justify-center text-plum">Explore</div>
              <div className="font-medium text-plum">Explore all styles</div>
            </div>
          </div>
        </section>

        {/* Featured Salons */}
        <section className="mb-10">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl text-plum">Featured Salons</h2>
            <a className="text-sm text-ink/70 hover:text-plum">View all</a>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {salons.map((salon) => (
              <div key={salon.id} className="rounded-lg border border-plum/10 bg-white p-4 shadow-sm">
                <div className="mb-3 h-40 w-full rounded-md bg-cream/60" />
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-plum">{salon.name}</div>
                    <div className="text-sm text-ink/70">{salon.neighborhood}</div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-ink/80">
                      <div className="flex text-amber">{Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={i < Math.round(salon.rating_overall || 0) ? "text-amber" : "text-ink/20"}>★</span>
                      ))}</div>
                      <div>{(salon.rating_overall || 0).toFixed(1)} · {salon.review_count || 0} reviews</div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="rounded-full bg-amber/10 px-3 py-1 text-xs font-semibold text-amber">Verified</div>
                    <div className="text-sm text-ink/80">From {startingMap[salon.id || ""] ? `$${startingMap[salon.id || ""]}` : "—"}</div>
                    <button className="mt-2 rounded-full bg-magenta px-4 py-2 text-xs font-semibold text-white">View times</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mb-10 rounded-lg border border-plum/10 bg-white p-6 shadow-sm">
          <h2 className="font-serif mb-4 text-2xl text-plum">How it works</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { title: "Find", text: "Search styles and salons near you." },
              { title: "Book", text: "See real availability and prices, book instantly." },
              { title: "Go", text: "Show up, slay, and leave a review." },
            ].map((s) => (
              <div key={s.title} className="rounded-lg bg-blush/30 p-4 text-center">
                <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-cream text-plum">✓</div>
                <div className="font-semibold text-plum">{s.title}</div>
                <div className="mt-2 text-sm text-ink/80">{s.text}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Trust strip */}
        <section className="mb-10 rounded-lg bg-ink/95 p-6 text-white">
          <div className="mx-auto grid max-w-[1000px] grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="text-center">
              <div className="font-semibold">Verified Salons</div>
              <div className="mt-1 text-sm text-cream/90">Identity & license confirmed</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">Real Reviews</div>
              <div className="mt-1 text-sm text-cream/90">Genuine customer feedback</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">Transparent Pricing</div>
              <div className="mt-1 text-sm text-cream/90">No surprises, ever</div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="rounded-lg border border-plum/10 bg-white p-6 text-sm text-ink/80">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-xl font-semibold text-plum">Girlz</span>
                <span className="font-serif text-xl font-semibold text-magenta">Culture</span>
              </div>
              <div className="mt-2 text-sm text-ink/70">The beauty booking marketplace for braided styles.</div>
            </div>

            <div className="hidden gap-8 md:flex">
              <div>
                <div className="mb-2 font-semibold">Company</div>
                <div className="space-y-1">
                  <div>About</div>
                  <div>Careers</div>
                </div>
              </div>
              <div>
                <div className="mb-2 font-semibold">Support</div>
                <div className="space-y-1">
                  <div>Help Center</div>
                  <div>Contact</div>
                </div>
              </div>
              <div>
                <div className="mb-2 font-semibold">Legal</div>
                <div className="space-y-1">
                  <div>Terms</div>
                  <div>Privacy</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-ink/60">© {new Date().getFullYear()} Girlz Culture</div>
            <div className="flex items-center gap-3 text-ink/60">
              <div className="h-6 w-6 rounded-full bg-ink/10" />
              <div className="h-6 w-6 rounded-full bg-ink/10" />
              <div className="h-6 w-6 rounded-full bg-ink/10" />
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
