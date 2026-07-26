import { notFound } from "next/navigation";
import NumericAcceptanceHarness from "@/components/internal/NumericAcceptanceHarness";

export default function NumericAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  return <NumericAcceptanceHarness />;
}
