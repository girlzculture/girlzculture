"use client";

import SalonSpreadsheetPanel from "@/components/owner/SalonSpreadsheetPanel";

export default function SalonSpreadsheetAcceptanceHarness() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-cream p-4 sm:p-8">
      <h1 className="mb-6 font-serif text-3xl text-plum">
        Salon Spreadsheet Acceptance
      </h1>
      <SalonSpreadsheetPanel kind="services" onImported={() => undefined} />
      <SalonSpreadsheetPanel kind="products" onImported={() => undefined} />
    </main>
  );
}
