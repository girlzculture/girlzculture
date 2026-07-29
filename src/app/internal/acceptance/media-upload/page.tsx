import { notFound } from "next/navigation";
import MediaUploadAcceptanceHarness from "@/components/internal/MediaUploadAcceptanceHarness";

export default function MediaUploadAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  return <MediaUploadAcceptanceHarness />;
}
