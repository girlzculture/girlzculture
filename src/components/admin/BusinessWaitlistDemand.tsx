"use client";
import { useEffect, useState } from "react";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";

export default function BusinessWaitlistDemand() {
  const [rows, setRows] = useState<Array<{category:string;name:string;requests:number}> | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient("admin");
        const body = await api.request<{categories:Array<{category:string;name:string;requests:number}>}>("/api/admin/business-waitlist", { signal: controller.signal });
        if (!controller.signal.aborted) { setRows(body.categories); setError(""); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Waitlist counts could not be loaded."); }
    })();
    return () => controller.abort();
  }, [refresh]);
  return <section className="rounded-xl border border-plum/10 bg-white p-5" aria-label="Business category demand">
    <h2 className="font-serif text-2xl">Business waitlists</h2>
    <p className="mt-2 text-sm gc-text-secondary">Submitted requests by category, including requests already reviewed. These are requests, not a count of unique businesses.</p>
    {rows ? <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">{rows.map(row => <div key={row.category} className="rounded-lg border p-3"><dt className="text-sm">{row.name}</dt><dd className="mt-1 text-2xl font-semibold">{row.requests}</dd></div>)}</dl> : !error ? <p role="status" className="mt-3">Loading waitlist counts…</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm gc-text-danger">{error}</p> : null}
    <button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-3 min-h-11 text-sm underline">Refresh waitlist counts</button>
  </section>;
}
