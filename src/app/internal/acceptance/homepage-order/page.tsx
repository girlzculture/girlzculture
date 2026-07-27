import { notFound } from "next/navigation";
import HomepageOrderAcceptanceHarness from "@/components/internal/HomepageOrderAcceptanceHarness";

export default function HomepageOrderAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  return <HomepageOrderAcceptanceHarness />;
}
