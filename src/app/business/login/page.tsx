import type { Metadata } from "next";
import SalonLogin from '@/components/SalonLogin';
import LanguageSelector from '@/components/i18n/LanguageSelector';

export const metadata: Metadata = { title: "Business Login | Girlz Culture", alternates: { canonical: "https://girlzculture.com/business/login" }, robots: { index: false, follow: true } };

export default function BusinessLoginPage() {
  return (
    <main className="min-h-screen bg-cream text-ink">
      <div data-language-selector-host className="flex justify-end px-4 pt-4"><LanguageSelector compact /></div>
      <div className="mx-auto w-full max-w-[900px] px-4 py-12">
        <div className="rounded-lg border border-plum/10 bg-white p-6 shadow-sm">
          <h1 className="font-serif mb-2 text-2xl text-plum">Business login</h1>
          <p className="mb-6 text-sm text-ink/70">Log in to manage your business.</p>
          <SalonLogin />
        </div>
      </div>
    </main>
  );
}
