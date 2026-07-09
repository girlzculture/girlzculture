import SalonSignup from '@/components/SalonSignup';

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-cream text-ink">
      <div className="mx-auto w-full max-w-[900px] px-4 py-12">
        <div className="rounded-lg border border-plum/10 bg-white p-6 shadow-sm">
          <h1 className="font-serif mb-2 text-2xl text-plum">Salon signup</h1>
          <p className="mb-6 text-sm text-ink/70">Create an account to list your salon on Girlz Culture.</p>
          <SalonSignup />
        </div>
      </div>
    </main>
  );
}
