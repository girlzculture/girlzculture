import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getEngineText } from "@/lib/engineConfigServer";
import { PublicHeader } from "@/components/site/PublicChrome";

export const dynamic = "force-dynamic";

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

const steps = [
  ["Business page", "Add the salon name, address, contact information, a short description, and languages. Save, refresh, and confirm the information remains."],
  ["Photos", "Choose clear JPG or PNG images. Upload a cover photo and gallery images, adjust each crop, save, then preview the public page on the device you used."],
  ["Services and pricing", "Add or import services, durations, starting and maximum prices, cleanup time, and any eligible add-ons."],
  ["Stylists or page highlight", "Publish stylist profiles when the salon has staff. Eligible plans can instead choose one salon-page highlight when no stylists are listed."],
  ["Products, hours, and availability", "Add any in-salon products, set regular business hours, and confirm the calendar is available for the correct days and times."],
  ["Final review", "Preview the public page on mobile, tablet, and desktop. Confirm photos, prices, booking availability, address, and contact details before publishing."],
] as const;

export default async function SalonSetupGuidePage() {
  const configured = await getEngineText("owner.image_resizer_resource_url", "", 600);
  const imageResizerUrl = safeExternalUrl(configured);
  return (
    <main className="min-h-screen bg-cream text-ink">
      <PublicHeader />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-magenta">Salon owner guide</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold text-plum sm:text-5xl">Set up your Girlz Culture page</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-ink/65">These steps work on a phone, tablet, or desktop. Save and refresh after each section so you know the information was stored.</p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2">
          {steps.map(([title, body], index) => <li key={title} className="rounded-[14px] border border-plum/10 bg-white p-5"><span className="text-[10px] font-bold text-magenta">STEP {index + 1}</span><h2 className="mt-1 font-serif text-xl font-semibold text-plum">{title}</h2><p className="mt-2 text-xs leading-6 text-ink/65">{body}</p></li>)}
        </ol>
        <section className="mt-6 rounded-[14px] border border-amber/25 bg-white p-5">
          <h2 className="font-serif text-xl font-semibold text-plum">Optional image-resizing resource</h2>
          {imageResizerUrl ? <><p className="mt-2 text-xs leading-6 text-ink/65">Girlz Culture provides this external resource for convenience. Review its privacy terms before uploading an image; it is not operated by Girlz Culture.</p><a href={imageResizerUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-[8px] border border-magenta px-4 text-xs font-bold text-magenta">Open configured image resizer <ExternalLink size={14} /></a></> : <p className="mt-2 text-xs leading-6 text-ink/65">No external image-resizing resource has been approved by the platform administrator. The built-in uploader will still optimize supported images.</p>}
        </section>
        <Link href="/salon/dashboard" className="mt-7 inline-flex min-h-11 items-center rounded-[8px] bg-magenta px-5 text-xs font-bold text-white">Return to dashboard</Link>
      </div>
    </main>
  );
}
