import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ReviewForm from "@/components/ReviewForm";

type BookingRecord = {
  id?: string;
  status?: string | null;
  salon_id?: string | null;
  customer_id?: string | null;
  appointment_datetime?: string | null;
};

type SalonRecord = {
  id?: string;
  name?: string | null;
  neighborhood?: string | null;
};

export default async function ReviewPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;

  const { data: bookingData, error: bookingError } = await supabase
    .from("bookings")
    .select("*, salon_id")
    .eq("id", bookingId)
    .maybeSingle<BookingRecord>();

  if (bookingError) {
    throw bookingError;
  }

  if (!bookingData) {
    notFound();
  }

  const { data: salonData, error: salonError } = await supabase
    .from("salons")
    .select("id, name, neighborhood")
    .eq("id", bookingData.salon_id)
    .maybeSingle<SalonRecord>();

  if (salonError) {
    throw salonError;
  }

  if (!salonData) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-cream px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1000px]">
        <ReviewForm booking={bookingData} salon={salonData} />
      </div>
    </main>
  );
}
