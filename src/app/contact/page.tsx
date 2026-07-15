import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import ContactSupportForm from "@/components/public/ContactSupportForm";

export default function ContactPage() {
  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader />
    <section className="mx-auto grid w-full max-w-[1320px] gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[.78fr_1.22fr] lg:py-12">
      <div>
        <h1 className="font-serif text-5xl leading-[.95] text-plum sm:text-6xl">How can we help?</h1>
        <p className="mt-4 max-w-lg text-sm leading-7 text-ink/65">Please send us a detailed request and we&apos;ll review and get back to you within 24 hours.</p>
      </div>
      <ContactSupportForm />
    </section>
    <PublicFooter />
  </main>;
}
