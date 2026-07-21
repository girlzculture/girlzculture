import type { Metadata } from "next";
import "./globals.css";
import PwaRegistration from "@/components/PwaRegistration";
import InlineFormValidation from "@/components/InlineFormValidation";
import CustomerLocationProvider from "@/components/location/CustomerLocationProvider";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import { cookies } from "next/headers";
import { localeDirection, normalizeLocale } from "@/i18n/catalog";
import LanguageSelector from "@/components/i18n/LanguageSelector";
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
          <div className="fixed bottom-[76px] right-3 z-[65] print:hidden md:bottom-4 md:right-4">
            <LanguageSelector
              compact
              className="shadow-[0_8px_30px_rgba(26,18,32,.14)] backdrop-blur"
            />
          </div>
          <InlineFormValidation />
          <PwaRegistration />
        </LocaleProvider>
      </body>
    </html>
  );
}
