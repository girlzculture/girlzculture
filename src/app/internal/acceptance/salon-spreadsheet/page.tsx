import { notFound } from "next/navigation";
import SalonSpreadsheetAcceptanceHarness from "@/components/internal/SalonSpreadsheetAcceptanceHarness";

export default function SalonSpreadsheetAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  return <SalonSpreadsheetAcceptanceHarness />;
}
