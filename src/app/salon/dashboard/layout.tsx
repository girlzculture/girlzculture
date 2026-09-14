import GcAssistant from "@/components/owner/GcAssistant";

// Shared layout preserves the conversation across owner routes. The Assistant
// clears its in-memory content on account changes and never stores it globally.
export default function OwnerWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <GcAssistant>{children}</GcAssistant>;
}
