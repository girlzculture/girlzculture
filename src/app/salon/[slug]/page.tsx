import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SalonBookingWizard from "@/components/SalonBookingWizard";
import SalonStyles from "@/components/SalonStyles";
import SalonStylists from "@/components/SalonStylists";

type SalonRecord = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  neighborhood?: string | null;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  rating_overall?: number | null;
  review_count?: number | null;
  badges?: string[] | string | null;
};

type StyleRecord = {
  id?: string;
  name?: string | null;
  price_display_min?: number | null;
  price_display_max?: number | null;
  duration_min_hours?: number | null;
  duration_max_hours?: number | null;
  length_options?: any | null;
  size_options?: any | null;
  addons?: any | null;
};

type StylistRecord = {
  id?: string;
  name?: string | null;
  specialties?: string[] | null;
  bio?: string | null;
  avatar_url?: string | null;
};

function renderStars(rating: number) {
  const fullStars = Math.round(rating);
  return Array.from({ length: 5 }, (_, index) => (
    <span key={index} className={index < fullStars ? "text-amber" : "text-ink/25"}>
      ★
    </span>
  ));
}

export default async function SalonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data, error } = await supabase
    .from("salons")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<SalonRecord>();

  if (error) {
    throw error;
  }

  if (!data) {
    notFound();
  }

  // fetch styles for this salon
  const { data: stylesData } = await supabase
    .from("styles")
    .select("*")
    .eq("salon_id", data.id);

  const styles = (stylesData || []) as StyleRecord[];

  // fetch stylists for this salon
  const { data: stylistsData } = await supabase
    .from("stylists")
    .select("*")
    .eq("salon_id", data.id);

  const stylists = (stylistsData || []) as StylistRecord[];

  const rating = typeof data.rating_overall === "number" ? data.rating_overall : 0;
  const reviewCount = typeof data.review_count === "number" ? data.review_count : 0;
  const badges = Array.isArray(data.badges)
    ? data.badges
    : typeof data.badges === "string"
      ? [data.badges]
      : [];

  const addressParts = [data.address_street, data.address_city, data.address_state, data.address_zip].filter(
    Boolean,
  ) as string[];
  const addressLine = addressParts.length
    ? addressParts.join(", ")
    : data.address || "Address coming soon";

  return (
    <main className="min-h-screen bg-cream px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1200px] flex flex-col gap-8">
        <section className="rounded-[24px] border border-plum/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(27,18,32,0.08)] backdrop-blur sm:p-8 lg:p-10">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
            <div className="col-span-12 lg:col-span-7">
              <div className="grid grid-cols-2 gap-3">
                <div className="row-span-2 rounded-lg overflow-hidden">
                  <div className="h-72 w-full rounded-lg bg-[url('/placeholder.jpg')] bg-cover bg-center" />
                </div>
                <div className="rounded-lg overflow-hidden">
                  <div className="h-32 w-full rounded-md bg-[url('/placeholder.jpg')] bg-cover bg-center" />
                </div>
                <div className="rounded-lg overflow-hidden">
                  <div className="h-32 w-full rounded-md bg-[url('/placeholder.jpg')] bg-cover bg-center" />
                </div>
                <div className="col-span-2 flex items-center justify-center rounded-lg bg-blush/40 py-3 text-sm font-semibold text-plum">+24</div>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-5">
              <div className="space-y-5">
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Featured salon</p>
                <h1 className="font-serif text-4xl font-semibold leading-tight text-plum sm:text-5xl lg:text-5xl">
                  {data.name || "Salon profile"}
                </h1>

                <div className="flex flex-wrap items-center gap-3 text-sm text-ink/80">
                  <span className="rounded-full bg-blush px-3 py-1 font-medium">{data.neighborhood || "Neighborhood"}</span>
                  <div className="flex items-center gap-2 rounded-full bg-cream px-3 py-1">
                    <div className="flex text-base">{renderStars(rating)}</div>
                    <span className="font-medium">{rating.toFixed(1)} overall</span>
                  </div>
                  <span className="font-medium">{reviewCount} reviews</span>
                </div>

                {badges.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {badges.map((badge) => (
                      <span
                        key={badge}
                        className="rounded-full border border-amber/40 bg-amber/15 px-3 py-1 text-sm font-semibold text-plum"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                ) : null}

                <p className="text-lg leading-8 text-ink/80">
                  {data.description || "A beautiful, intention-led salon experience crafted for confidence and care."}
                </p>

                <div className="mt-2 w-full max-w-full">
                  <a
                    href={`/salon/${data.slug}/book`}
                    className="inline-flex w-full items-center justify-center rounded-full bg-magenta px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-[0_12px_30px_rgba(214,24,107,0.23)] transition hover:-translate-y-0.5 hover:bg-magenta/90"
                  >
                    Book Appointment
                  </a>
                </div>

                <div className="space-y-3 text-sm leading-7 text-ink/80">
                  <div>
                    <p className="font-semibold text-plum">Phone</p>
                    <p>{data.phone || "Available soon"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-plum">Email</p>
                    <p>{data.email || "Available soon"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[24px] border border-plum/10 bg-white/80 p-6 shadow-sm sm:p-8">
            <h2 className="font-serif text-2xl text-plum">About this salon</h2>
            <p className="mt-4 text-lg leading-8 text-ink/80">
              {data.description || "A beautiful, intention-led salon experience crafted for confidence and care."}
            </p>

            <div className="mt-8">
              <h3 className="font-serif text-xl text-plum">Styles & Pricing</h3>
              <p className="mt-2 text-sm text-ink/70">Select a style to view full pricing and time details.</p>
              <div className="mt-4">
                {/* Client component for interactive style accordion */}
                <SalonStyles styles={styles} />
              </div>
            </div>

            <div className="mt-8">
              <h3 className="font-serif text-xl text-plum">Our Stylists</h3>
              <p className="mt-2 text-sm text-ink/70">Meet the pros behind your perfect style.</p>
              <div className="mt-4">
                <SalonStylists stylists={stylists} />
              </div>
            </div>
          </section>

          <aside className="rounded-[24px] border border-plum/10 bg-blush/70 p-6 shadow-sm sm:p-8">
            <h2 className="font-serif text-2xl text-plum">Visit</h2>
            <dl className="mt-4 space-y-4 text-sm leading-7 text-ink/80">
              <div>
                <dt className="font-semibold text-plum">Address</dt>
                <dd>{addressLine}</dd>
              </div>
              <div>
                <dt className="font-semibold text-plum">Neighborhood</dt>
                <dd>{data.neighborhood || "Neighborhood"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-plum">Phone</dt>
                <dd>{data.phone || "Available soon"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-plum">Email</dt>
                <dd>{data.email || "Available soon"}</dd>
              </div>
            </dl>
          </aside>
        </div>
        <section className="rounded-[24px] border border-plum/10 bg-white/80 p-6 shadow-sm sm:p-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="font-serif text-xl text-plum">Hours</h3>
              <div className="mt-3 text-sm text-ink/80">
                <table className="w-full table-auto text-left text-sm">
                  <tbody>
                    {[
                      ["Mon", "9:00 AM – 7:00 PM"],
                      ["Tue", "9:00 AM – 7:00 PM"],
                      ["Wed", "9:00 AM – 7:00 PM"],
                      ["Thu", "9:00 AM – 7:00 PM"],
                      ["Fri", "9:00 AM – 7:00 PM"],
                      ["Sat", "9:00 AM – 6:00 PM"],
                      ["Sun", "Closed"],
                    ].map(([d, h]) => (
                      <tr key={d} className="border-b border-ink/6">
                        <td className="py-2 font-medium text-ink/80">{d}</td>
                        <td className="py-2 text-ink/70">{h}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="font-serif text-xl text-plum">Address</h3>
              <div className="mt-3 text-sm text-ink/80">
                <p className="font-semibold">{data.name}</p>
                <p>{addressLine}</p>
                <div className="mt-4 h-40 w-full rounded-lg bg-cream/60" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
