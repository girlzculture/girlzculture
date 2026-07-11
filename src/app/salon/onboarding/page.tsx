import SalonOnboarding from '@/components/SalonOnboarding';

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-cream text-ink">
      <div className="mx-auto w-full max-w-[900px] px-4 py-12">
        <div className="rounded-lg border border-plum/10 bg-white p-6 shadow-sm">
          <h1 className="font-serif mb-2 text-2xl text-plum">Salon onboarding</h1>
          <p className="mb-6 text-sm text-ink/70">Let&apos;s get your salon listed — step by step.</p>
          <SalonOnboarding />
        </div>
      </div>
    </main>
  );
}
