import { notFound } from "next/navigation";
import OwnerWorkflowAcceptanceHarness from "@/components/internal/OwnerWorkflowAcceptanceHarness";

export default function OwnerWorkflowAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  return <OwnerWorkflowAcceptanceHarness />;
}
