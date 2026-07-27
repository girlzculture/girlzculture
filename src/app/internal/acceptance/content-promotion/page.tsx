import { notFound } from "next/navigation";
import HomepagePromotionAcceptanceHarness from "@/components/internal/HomepagePromotionAcceptanceHarness";

export default function HomepagePromotionAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  return <HomepagePromotionAcceptanceHarness />;
}
