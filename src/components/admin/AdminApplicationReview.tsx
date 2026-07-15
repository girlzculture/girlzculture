/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, ExternalLink, FileText } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { RoleSessionBoundary } from "@/components/auth/RoleLogoutButton";

type Application = Record<string, unknown> & { id: string; status: string; business_name: string };

const fields: Array<[string, string]> = [
  ["Owner / contact", "owner_name"], ["Business email", "business_email"], ["Phone", "phone"],
  ["Business type", "business_type"], ["Years in operation", "years_in_operation"], ["Number of stylists", "stylist_count"],
  ["Business license", "business_license_number"], ["Cosmetology license", "cosmetology_license_number"],
  ["Selected plan", "selected_plan"], ["Referral source", "referral_source"], ["Submitted", "submitted_at"],
];

export default function AdminApplicationReview({ id }: { id: string }) {
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Admin sign-in required.");
    const response = await fetch(`/api/admin/submissions/${id}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load application.");
    setApplication(body.application);
  }

  useEffect(() => {
    // The asynchronous loader owns the resulting request state for this route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load application.")).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function decide(decision: "approve" | "reject" | "activate") {
    const reason = decision === "reject" ? window.prompt("Reason for rejection:") : undefined;
    if (decision === "reject" && !reason?.trim()) return;
    const session = await getSessionForScope("admin");
    if (!session) { setMessage("Your admin session expired."); return; }
    setMessage("Saving decision...");
    const response = await fetch(`/api/admin/submissions/${id}/decision`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ decision, reason }),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Unable to save decision."); return; }
    await load();
    setMessage(`Application is now ${String(body.status).toLowerCase()}.`);
  }

  if (loading) return <div className="grid min-h-screen place-items-center bg-cream text-plum">Loading application...</div>;
  if (!application) return <div className="grid min-h-screen place-items-center bg-cream p-5"><div className="rounded-2xl bg-white p-8 text-center"><p>{message || "Application not found."}</p><Link href="/admin/submissions" className="mt-4 inline-flex text-magenta">Back to submissions</Link></div></div>;

  const photos = Array.isArray(application.photo_urls) ? application.photo_urls.map(String) : [];
  const documents = Array.isArray(application.document_urls) ? application.document_urls.map(String) : [];
  const address = [application.street_address, application.address_line2, application.city, application.state, application.zip_code].filter(Boolean).join(", ");
  return <main className="min-h-screen bg-cream px-4 py-6 text-ink sm:px-8"><RoleSessionBoundary scope="admin" />
    <div className="mx-auto max-w-[1280px]"><Link href="/admin/submissions" className="inline-flex items-center gap-2 text-sm font-bold text-magenta"><ArrowLeft size={17}/>Back to submissions</Link>
      <header className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-magenta">Salon application</p><h1 className="mt-2 font-serif text-4xl font-semibold text-plum sm:text-5xl">{application.business_name}</h1><p className="mt-2 text-ink/60">{address}</p></div><span className="rounded-full bg-blush px-4 py-2 text-xs font-bold text-plum">{application.status}</span></header>
      {message ? <p className="mt-5 rounded-xl bg-blush/60 p-3 text-sm text-plum">{message}</p> : null}
      <div className="mt-7 grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><section className="rounded-[18px] border border-plum/10 bg-white p-5 sm:p-7"><h2 className="font-serif text-2xl text-plum">Business details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">{fields.map(([label,key]) => <div key={key} className="rounded-xl bg-blush/20 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-ink/45">{label}</p><p className="mt-1 break-words text-sm font-semibold">{String(application[key] || "Not provided")}</p></div>)}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{[["Website","website_url"],["Instagram","instagram_url"]].map(([label,key]) => application[key] ? <a key={key} href={String(application[key])} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-plum/10 p-4 text-sm font-bold text-magenta">{label}<ExternalLink size={16}/></a> : null)}</div>
        <div className="mt-6"><h3 className="font-serif text-xl text-plum">Salon photos</h3>{photos.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{photos.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}><img src={url} alt="Salon application" className="aspect-square w-full rounded-xl object-cover"/></a>)}</div> : <p className="mt-2 text-sm text-ink/55">No salon photos supplied.</p>}</div>
      </section><aside className="space-y-5"><section className="rounded-[18px] border border-plum/10 bg-white p-5"><div className="flex items-center gap-3"><Building2 className="text-magenta"/><h2 className="font-serif text-2xl text-plum">Review decision</h2></div><p className="mt-3 text-sm leading-6 text-ink/60">Approve the due-diligence application, reject it with a reason, then activate the salon when it is ready for subscription setup.</p><div className="mt-5 grid gap-3">{application.status === "Pending" ? <><button onClick={() => void decide("approve")} className="rounded-lg bg-magenta px-5 py-3 font-bold text-white">Approve application</button><button onClick={() => void decide("reject")} className="rounded-lg border border-magenta px-5 py-3 font-bold text-magenta">Reject with reason</button></> : application.status === "Approved" ? <button onClick={() => void decide("activate")} className="rounded-lg bg-plum px-5 py-3 font-bold text-white">Activate salon store</button> : <p className="rounded-lg bg-blush/30 p-3 text-sm">No pending action for this application.</p>}</div></section>
        <section className="rounded-[18px] border border-plum/10 bg-white p-5"><div className="flex items-center gap-3"><FileText className="text-magenta"/><h2 className="font-serif text-2xl text-plum">Private documents</h2></div>{documents.length ? <div className="mt-4 space-y-2">{documents.map((url,index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg bg-blush/25 p-3 text-sm font-bold text-magenta">Open document {index + 1}<ExternalLink size={15}/></a>)}</div> : <p className="mt-3 text-sm text-ink/55">No supporting documents supplied.</p>}</section>
      </aside></div>
    </div></main>;
}
