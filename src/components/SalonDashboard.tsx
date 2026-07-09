"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type SalonRecord = {
  id?: string;
  name?: string | null;
  neighborhood?: string | null;
  email?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  description?: string | null;
  phone?: string | null;
  review_count?: number | null;
  rating_overall?: number | null;
};

type BookingRecord = {
  id?: string;
  salon_id?: string | null;
  customer_id?: string | null;
  style_id?: string | null;
  status?: string | null;
  appointment_datetime?: string | null;
  estimated_total?: number | null;
};

type ReviewRecord = {
  id?: string;
  overall_rating?: number | null;
  comments?: string | null;
  created_at?: string | null;
};

type StyleRecord = {
  id?: string;
  name?: string | null;
};

type SubscriptionRecord = {
  subscription_tier?: string | null;
};

function renderStars(value: number) {
  return Array.from({ length: 5 }, (_, index) => (
    <span key={index} className={index < value ? "text-amber" : "text-ink/25"}>
      ★
    </span>
  ));
}

export default function SalonDashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [salon, setSalon] = useState<SalonRecord | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [styles, setStyles] = useState<StyleRecord[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user?.email) {
        setError("You must be signed in to view the salon dashboard.");
        setLoading(false);
        return;
      }

      const email = userData.user.email;
      setUserEmail(email);

      const { data: salonData, error: salonError } = await supabase
        .from("salons")
        .select("*")
        .eq("email", email)
        .maybeSingle<SalonRecord>();

      if (salonError) {
        setError(salonError.message);
        setLoading(false);
        return;
      }

      if (!salonData) {
        setError("No salon profile found for the signed-in email. Please complete onboarding first.");
        setLoading(false);
        return;
      }

      setSalon(salonData);

      const [bookingsRes, reviewsRes, stylesRes, subscriptionRes] = await Promise.all([
        supabase.from("bookings").select("*").eq("salon_id", salonData.id),
        supabase.from("reviews").select("*").eq("salon_id", salonData.id).order("created_at", { ascending: false }).limit(4),
        supabase.from("styles").select("id, name").eq("salon_id", salonData.id),
        supabase.from("subscriptions").select("subscription_tier").eq("salon_id", salonData.id).maybeSingle<SubscriptionRecord>(),
      ]);

      if (bookingsRes.error) {
        setError(bookingsRes.error.message);
      } else {
        setBookings((bookingsRes.data || []) as BookingRecord[]);
      }

      if (reviewsRes.error) {
        setError(reviewsRes.error.message);
      } else {
        setReviews((reviewsRes.data || []) as ReviewRecord[]);
      }

      if (stylesRes.error) {
        // ignore style lookup failures for now
      } else {
        setStyles((stylesRes.data || []) as StyleRecord[]);
      }

      if (subscriptionRes.error) {
        // ignore missing subscription records
      } else {
        setSubscription(subscriptionRes.data || null);
      }

      setLoading(false);
    };

    loadDashboard();
  }, []);

  const stats = useMemo(() => {
    const bookingRequests = bookings.length;
    const customerIds = bookings
      .map((item) => item.customer_id)
      .filter((id): id is string => Boolean(id));
    const newCustomers = new Set(customerIds).size;
    const revenue = bookings
      .filter((item) => item.status?.toLowerCase() === "completed")
      .reduce((sum, item) => sum + (item.estimated_total ?? 0), 0);

    return {
      bookingRequests,
      newCustomers,
      revenue,
      profileViews: 1200,
    };
  }, [bookings]);

  const upcomingAppointments = useMemo(() => {
    const now = new Date();
    return bookings
      .filter((booking) => {
        if (!booking.appointment_datetime) return false;
        const appt = new Date(booking.appointment_datetime);
        return appt > now;
      })
      .sort((a, b) => {
        if (!a.appointment_datetime || !b.appointment_datetime) return 0;
        return new Date(a.appointment_datetime).getTime() - new Date(b.appointment_datetime).getTime();
      })
      .slice(0, 6);
  }, [bookings]);

  const styleMap = useMemo(() => {
    return styles.reduce<Record<string, string>>((acc, style) => {
      if (style.id && style.name) acc[style.id] = style.name;
      return acc;
    }, {});
  }, [styles]);

  const applicableTier = subscription?.subscription_tier || "Free";

  const completionPct = useMemo(() => {
    if (!salon) return 0;
    const fields = [
      salon.name,
      salon.description,
      salon.phone,
      salon.email,
      salon.address_street,
      salon.address_city,
      salon.address_state,
      salon.address_zip,
      salon.neighborhood,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [salon]);

  if (loading) {
    return (
      <div className="rounded-[24px] border border-plum/10 bg-white/80 p-8 text-center text-ink/70">Loading your salon dashboard…</div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
        <div className="font-semibold">Dashboard unavailable</div>
        <p className="mt-2">{error}</p>
        <a href="/salon/login" className="mt-4 inline-flex rounded-full bg-magenta px-4 py-2 text-sm font-semibold text-white">Sign in</a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-plum/10 bg-white/80 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Salon Owner Dashboard</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold text-plum">{salon?.name}</h1>
            <p className="mt-2 text-sm text-ink/70">{salon?.neighborhood || "Neighborhood not set"}</p>
          </div>
          <a
            href={`/salon/${salon?.name ? salon.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : ""}`}
            className="inline-flex items-center rounded-full bg-magenta px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(214,24,107,0.24)] hover:bg-magenta/90"
          >
            View Public Profile
          </a>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Profile Views", value: stats.profileViews, caption: "Coming soon" },
              { label: "Booking Requests", value: stats.bookingRequests, caption: "Total requests" },
              { label: "New Customers", value: stats.newCustomers, caption: "Distinct customer count" },
              { label: "Revenue", value: stats.revenue, caption: "Completed bookings" },
            ].map((item) => (
              <div key={item.label} className="rounded-[24px] border border-plum/10 bg-blush/30 p-5">
                <div className="text-sm font-semibold uppercase tracking-[0.25em] text-ink/60">{item.label}</div>
                <div className="mt-3 text-3xl font-semibold text-plum">{item.label === "Revenue" ? `$${item.value.toFixed(2)}` : item.value}</div>
                <div className="mt-2 text-sm text-ink/70">{item.caption}</div>
              </div>
            ))}
          </div>

          <div className="rounded-[24px] border border-plum/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Upcoming Appointments</p>
                <p className="mt-2 text-sm text-ink/70">Next bookings scheduled for your salon.</p>
              </div>
              <div className="text-sm font-semibold text-plum">{upcomingAppointments.length} scheduled</div>
            </div>
            {upcomingAppointments.length === 0 ? (
              <div className="mt-6 rounded-[24px] border border-dashed border-plum/20 bg-blush/40 p-6 text-sm text-ink/70">No upcoming appointments yet.</div>
            ) : (
              <div className="mt-6 space-y-4">
                {upcomingAppointments.map((booking) => {
                  const dateText = booking.appointment_datetime ? new Date(booking.appointment_datetime).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No date";
                  return (
                    <div key={booking.id} className="rounded-[24px] border border-plum/10 bg-cream/70 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-plum">{styleMap[booking.style_id || ""] || "Style not set"}</p>
                          <p className="text-sm text-ink/70">{dateText}</p>
                        </div>
                        <div className="rounded-full bg-blush px-3 py-1 text-sm font-semibold text-plum">{booking.status || "Pending"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-plum/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Subscription</p>
                <p className="mt-2 text-sm text-ink/70">Current tier for your salon.</p>
              </div>
              <div className="rounded-full bg-cream px-4 py-2 text-sm font-semibold text-plum">{applicableTier}</div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-ink/70">Manage your tier or upgrade for more visibility.</div>
              <button className="rounded-full bg-magenta px-4 py-2 text-sm font-semibold text-white hover:bg-magenta/90">Upgrade plan</button>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[24px] border border-plum/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Profile completion</p>
                <p className="mt-2 text-sm text-ink/70">Keep your page up to date.</p>
              </div>
              <div className="text-2xl font-semibold text-plum">{completionPct}%</div>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-cream">
              <div className="h-full rounded-full bg-magenta" style={{ width: `${completionPct}%` }} />
            </div>
          </div>

          <div className="rounded-[24px] border border-plum/10 bg-blush/30 p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Quick actions</p>
            <div className="mt-4 grid gap-3">
              {[
                "Add availability",
                "Upload gallery photos",
                "Update pricing",
                "Refresh salon details",
              ].map((action) => (
                <button key={action} className="w-full rounded-full border border-plum/10 bg-white px-4 py-3 text-left text-sm font-semibold text-plum hover:bg-cream">
                  {action}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-[24px] border border-plum/10 bg-white/80 p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Recent Reviews</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-plum">What customers are saying</h2>
          </div>
          <div className="text-sm text-ink/70">Latest feedback from completed bookings.</div>
        </div>

        {reviews.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-plum/20 bg-blush/40 p-6 text-sm text-ink/70">No reviews yet. Encourage customers to leave feedback after their appointments.</div>
        ) : (
          <div className="mt-6 space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-[24px] border border-plum/10 bg-cream/70 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-lg font-semibold text-plum">{renderStars(review.overall_rating ?? 0)}</div>
                  <div className="text-sm text-ink/70">{review.created_at ? new Date(review.created_at).toLocaleDateString() : "Recent"}</div>
                </div>
                <p className="mt-3 text-sm leading-7 text-ink/80">{review.comments || "No written feedback."}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
