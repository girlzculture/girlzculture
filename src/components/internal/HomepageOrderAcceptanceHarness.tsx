"use client";
/* eslint-disable react-hooks/set-state-in-effect -- this test-only harness restores persisted browser state after hydration */

import { useEffect, useState } from "react";
import AdminHomepageMarketing from "@/components/admin/AdminHomepageMarketing";
import {
  normalizeHomepageSectionOrder,
  type HomepageSectionOrderRow,
} from "@/lib/homepageSectionOrderingCore";

const STORAGE_KEY = "gc-homepage-order-acceptance-v1";

export default function HomepageOrderAcceptanceHarness() {
  const [initial, setInitial] = useState<HomepageSectionOrderRow[] | null>(null);

  useEffect(() => {
    try {
      setInitial(
        normalizeHomepageSectionOrder(
          JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"),
        ),
      );
    } catch {
      setInitial(normalizeHomepageSectionOrder([]));
    }
  }, []);

  if (!initial) return <p className="p-8">Preparing homepage controls...</p>;

  return (
    <main className="min-h-screen bg-cream p-4 text-ink sm:p-8">
      <AdminHomepageMarketing
        acceptanceInitialSections={initial}
        acceptancePublish={async (sections) => {
          const normalized = normalizeHomepageSectionOrder(sections);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          return normalized;
        }}
      />
    </main>
  );
}
