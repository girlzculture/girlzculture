import { notFound } from "next/navigation";
import AccessibilityStatesAcceptanceHarness from "@/components/internal/AccessibilityStatesAcceptanceHarness";

export default function AccessibilityStatesAcceptancePage() {
  const enabled =
    process.env.GIRLZ_CULTURE_ACCEPTANCE_MODE === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS === "true";
  if (!enabled) notFound();
  return <AccessibilityStatesAcceptanceHarness />;
}
