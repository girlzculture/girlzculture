// Query-dependent onboarding must never become a reusable static HTML artifact.
export const dynamic = "force-dynamic";

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
