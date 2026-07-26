import ReviewForm from "@/components/ReviewForm";
import { resolveBookingReviewLink } from "@/lib/reviewAccessServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId: token } = await params;
  const resolution = await resolveBookingReviewLink(token);
  return (
    <main className="min-h-screen bg-white px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1000px]">
        <ReviewForm
          token={token}
          state={resolution.state}
          message={"message" in resolution ? resolution.message : undefined}
          booking={"booking" in resolution ? resolution.booking : undefined}
          salon={"salon" in resolution ? resolution.salon : undefined}
          existing={"review" in resolution ? resolution.review : undefined}
        />
      </div>
    </main>
  );
}
