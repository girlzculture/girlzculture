import type { Metadata } from "next";
import DemoBusinessWorkspace from "@/components/dashboard/DemoBusinessWorkspace";

export const metadata: Metadata = { title: "Girlz Culture Demo Studio — sample business workspace", robots: { index: false, follow: false, noarchive: true } };
export default function DemoBusinessPage() { return <DemoBusinessWorkspace/>; }
