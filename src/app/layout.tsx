import type { Metadata } from "next";
import "./globals.css";
import PwaRegistration from "@/components/PwaRegistration";

export const metadata: Metadata = {
  title: {
    default: "Girlz Culture — Book braids with confidence",
    template: "%s | Girlz Culture",
  },
  description: "Discover braiding salons, compare services and prices, and book an appointment.",
  applicationName: "Girlz Culture",
  keywords: ["hair braiding", "braiding salons", "knotless braids", "box braids", "beauty booking"],
  manifest:"/manifest.webmanifest",
  appleWebApp:{capable:true,statusBarStyle:"default",title:"Girlz Culture"},
  formatDetection:{telephone:false},
  robots:process.env.NEXT_PUBLIC_ALLOW_INDEXING==="true"?{index:true,follow:true}:{index:false,follow:false,noarchive:true,nosnippet:true},
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}<PwaRegistration /></body>
    </html>
  );
}
