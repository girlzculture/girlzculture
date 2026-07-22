import type { Metadata } from "next";
import "./globals.css";
import PwaRegistration from "@/components/PwaRegistration";
import InlineFormValidation from "@/components/InlineFormValidation";
import CustomerLocationProvider from "@/components/location/CustomerLocationProvider";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import { cookies } from "next/headers";
import { localeDirection, normalizeLocale } from "@/i18n/catalog";
import { getEngineColor } from "@/lib/engineConfigServer";
import type { CSSProperties } from "react";
import DocumentLocalizationBridge from "@/components/i18n/DocumentLocalizationBridge";

export const metadata: Metadata = {
  title: {
    default: "Girlz Culture — Book braids with confidence",
    template: "%s | Girlz Culture",
  },
  description:
    "Discover braiding salons, compare services and prices, and book an appointment.",
  applicationName: "Girlz Culture",
  keywords: [
    "hair braiding",
    "braiding salons",
    "knotless braids",
    "box braids",
    "beauty booking",
  ],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Girlz Culture",
  },
  formatDetection: { telephone: false },
  robots:
    process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true"
      ? { index: true, follow: true }
      : { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = normalizeLocale((await cookies()).get("gc_locale")?.value);
  const [primaryColor, ctaColor] = await Promise.all([
    getEngineColor("branding.primary_color", "#5B1A6B"),
    getEngineColor("branding.cta_color", "#D6186B"),
  ]);
  return (
    <html
      lang={locale}
      dir={localeDirection(locale)}
      className="h-full antialiased"
      style={
        { "--gc-plum": primaryColor, "--gc-magenta": ctaColor } as CSSProperties
      }
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider initialLocale={locale}>
          <CustomerLocationProvider>{children}</CustomerLocationProvider>
          <DocumentLocalizationBridge />
          <InlineFormValidation />
          <PwaRegistration />
        </LocaleProvider>
      </body>
    </html>
  );
}
