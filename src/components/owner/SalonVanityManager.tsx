"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Camera, Check, Copy, ExternalLink, Link2, QrCode } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";

type Salon = {
  slug?: string;
  vanity_slug?: string;
  instagram_url?: string;
  tiktok_url?: string;
  google_business_url?: string;
};
type VanityRequest = {
  id: string;
  requested_slug: string;
  status: string;
  approved_slug?: string | null;
  review_note?: string | null;
  created_at: string;
};

export default function SalonVanityManager({ salon }: { salon: Salon }) {
  const [current, setCurrent] = useState(salon);
  const [latest, setLatest] = useState<VanityRequest | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function headers(json = false) {
    const session = await getSessionForScope("salon");
    if (!session) throw new Error("Your salon session has expired.");
    return {
      Authorization: `Bearer ${session.access_token}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }
  async function load() {
    const response = await fetch("/api/salon/profile", {
      headers: await headers(),
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load public URL settings.");
    setCurrent(body.salon || salon);
    setLatest(body.vanity_request || null);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) =>
        setMessage(error instanceof Error ? error.message : "Unable to load public URL settings."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/salon/profile", {
        method: "POST",
        headers: await headers(true),
        body: JSON.stringify({
          action: "request_vanity",
          requested_slug: form.get("requested_slug"),
          instagram_url: form.get("instagram_url"),
          tiktok_url: form.get("tiktok_url"),
          google_business_url: form.get("google_business_url"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to request this public URL.");
      setMessage("Your public URL request was submitted for platform review.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to request this public URL.");
    } finally {
      setSaving(false);
    }
  }

  const publicPath = current.vanity_slug
    ? `/${current.vanity_slug}`
    : current.slug
      ? `/salon/${current.slug}`
      : "";
  async function copy() {
    if (!publicPath) return;
    await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="mt-4 rounded-[14px] border border-plum/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-plum">Public Link & Social Profiles</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-ink/55">
            Request a short Girlz Culture link. Platform review prevents route
            collisions and protects links that clients may already have saved.
          </p>
        </div>
        {publicPath ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => void copy()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-magenta px-3 text-xs font-bold text-magenta">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy Link"}
            </button>
            <Link href={publicPath} target="_blank" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-plum px-3 text-xs font-bold text-white">
              Open <ExternalLink size={14} />
            </Link>
          </div>
        ) : null}
      </div>

      {current.vanity_slug ? (
        <div className="mt-4 grid gap-4 rounded-xl bg-cream p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-magenta">Approved vanity URL</p>
            <p className="mt-2 break-all font-serif text-xl text-plum">girlzculture.com/{current.vanity_slug}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {current.instagram_url ? <a href={current.instagram_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-magenta"><Camera size={14}/>Instagram</a> : null}
              {current.tiktok_url ? <a href={current.tiktok_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-magenta"><Link2 size={14}/>TikTok</a> : null}
              {current.google_business_url ? <a href={current.google_business_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-magenta"><Link2 size={14}/>Google Business</a> : null}
            </div>
          </div>
          <Image src={`/api/salons/${current.vanity_slug}/qr`} alt={`QR code for girlzculture.com/${current.vanity_slug}`} width={112} height={112} unoptimized className="h-28 w-28 rounded-lg bg-white p-2" />
        </div>
      ) : null}

      {latest ? (
        <p className="mt-4 rounded-lg bg-blush/35 p-3 text-xs text-plum">
          Latest request: <b>/{latest.requested_slug}</b> · {latest.status}
          {latest.review_note ? ` · ${latest.review_note}` : ""}
        </p>
      ) : null}
      {message ? <p role="status" className="mt-4 rounded-lg bg-blush/45 p-3 text-xs text-plum">{message}</p> : null}

      <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold sm:col-span-2">Requested Girlz Culture URL
          <span className="mt-1 flex min-h-11 items-center rounded-lg border border-plum/15 bg-white px-3 font-normal">
            <span className="text-ink/45">girlzculture.com/</span>
            <input name="requested_slug" required minLength={3} maxLength={72} defaultValue={current.vanity_slug || ""} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="aminata-braids" className="min-w-0 flex-1 bg-transparent outline-none" />
          </span>
        </label>
        <Field name="instagram_url" label="Instagram profile" defaultValue={current.instagram_url} placeholder="https://instagram.com/..." />
        <Field name="tiktok_url" label="TikTok profile" defaultValue={current.tiktok_url} placeholder="https://tiktok.com/@..." />
        <Field name="google_business_url" label="Google Business profile" defaultValue={current.google_business_url} placeholder="https://g.page/..." wide />
        <button disabled={saving || latest?.status === "Pending"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white disabled:opacity-45 sm:col-span-2">
          <QrCode size={16} />{saving ? "Submitting…" : latest?.status === "Pending" ? "Awaiting platform review" : "Request link approval"}
        </button>
      </form>
    </section>
  );
}

function Field({ name, label, defaultValue, placeholder, wide = false }: { name: string; label: string; defaultValue?: string; placeholder: string; wide?: boolean }) {
  return <label className={`text-xs font-bold ${wide ? "sm:col-span-2" : ""}`}>{label}<input name={name} type="url" defaultValue={defaultValue || ""} placeholder={placeholder} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal" /></label>;
}
