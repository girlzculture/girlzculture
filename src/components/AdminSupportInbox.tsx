"use client";

import { FormEvent, useMemo, useState } from "react";
import { Mail, MessageSquare, Send } from "lucide-react";
import { adminSupabase as supabase } from "@/lib/supabase";

type Ticket = Record<string, string | null>;

export default function AdminSupportInbox({ initialTickets = [] }: { initialTickets?: Ticket[] }) {
  const safeInitialTickets = Array.isArray(initialTickets) ? initialTickets : [];
  const [tickets, setTickets] = useState(safeInitialTickets);
  const [selectedId, setSelectedId] = useState(safeInitialTickets[0]?.id || "");
  const [response, setResponse] = useState("");
  const [filter, setFilter] = useState("All");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const selected = tickets.find((ticket) => ticket.id === selectedId) || null;
  const visible = useMemo(() => filter === "All" ? tickets : tickets.filter((ticket) => ticket.status === filter), [filter, tickets]);

  async function respond(event: FormEvent) {
    event.preventDefault();
    if (!selected?.id) return;
    setSending(true); setNotice("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your admin session has expired.");
      const request = await fetch(`/api/admin/support/${selected.id}/respond`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ response, status: "Resolved" }),
      });
      const body = await request.json();
      if (!request.ok) throw new Error(body.error || "Unable to respond");
      setTickets((rows) => rows.map((row) => row.id === body.data.id ? body.data : row));
      setResponse(""); setNotice("Response saved and the request is resolved.");
    } catch (error) {
      console.error("Admin support response error", error);
      setNotice(error instanceof Error ? error.message : "Unable to respond");
    } finally { setSending(false); }
  }

  return <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
    <section className="rounded-[14px] border border-plum/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl text-plum">Support Inbox</h2><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-plum/10 px-3 py-2 text-xs"><option>All</option><option>Open</option><option>In Progress</option><option>Resolved</option></select></div>
      <p className="mt-1 text-xs text-ink/55">{tickets.filter((ticket) => ticket.status === "Open").length} open requests</p>
      <div className="mt-4 space-y-2">{visible.length ? visible.map((ticket) => <button key={ticket.id || ticket.subject || "ticket"} onClick={() => setSelectedId(ticket.id || "")} className={`w-full rounded-xl border p-4 text-left ${selectedId === ticket.id ? "border-magenta bg-blush/30" : "border-plum/10"}`}><div className="flex items-center justify-between gap-2"><b className="line-clamp-1 text-sm text-plum">{ticket.subject}</b><span className="rounded-full bg-blush px-2 py-1 text-[9px] font-bold text-magenta">{ticket.status}</span></div><p className="mt-1 text-xs text-ink/55">{ticket.requester_name} · {ticket.category}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-ink/70">{ticket.message}</p></button>) : <p className="rounded-xl bg-blush/20 p-6 text-center text-sm text-ink/55">No requests in this view.</p>}</div>
    </section>
    <section className="rounded-[14px] border border-plum/10 bg-white p-5">{selected ? <>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-[10px] font-bold uppercase tracking-[.15em] text-magenta">{selected.category}</span><h2 className="mt-1 font-serif text-3xl text-plum">{selected.subject}</h2></div><span className="rounded-full bg-blush px-3 py-1.5 text-xs font-bold text-magenta">{selected.status}</span></div>
      <div className="mt-5 grid gap-3 rounded-xl bg-cream p-4 text-sm sm:grid-cols-2"><span className="flex items-center gap-2"><MessageSquare size={16} className="text-magenta" />{selected.requester_name}</span><a href={`mailto:${selected.requester_email}`} className="flex items-center gap-2 text-magenta"><Mail size={16} />{selected.requester_email}</a></div>
      <div className="mt-5 rounded-xl border border-plum/10 p-5"><p className="whitespace-pre-wrap text-sm leading-7 text-ink/75">{selected.message}</p></div>
      {selected.admin_response ? <div className="mt-4 rounded-xl bg-blush/30 p-5"><b className="text-sm text-plum">Admin response</b><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selected.admin_response}</p></div> : null}
      <form onSubmit={respond} className="mt-5"><label className="text-xs font-bold text-plum">Reply<textarea required value={response} onChange={(event) => setResponse(event.target.value)} rows={6} placeholder="Write a helpful response…" className="mt-2 w-full rounded-xl border border-plum/10 p-4 font-normal outline-none focus:border-magenta" /></label>{notice ? <p className="mt-3 rounded-lg bg-blush/40 p-3 text-sm text-plum">{notice}</p> : null}<button disabled={sending} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-magenta px-6 py-3 text-sm font-bold text-white disabled:opacity-60"><Send size={16} />{sending ? "Sending…" : "Send response"}</button></form>
    </> : <div className="grid min-h-[360px] place-items-center text-sm text-ink/50">Select a support request.</div>}</section>
  </div>;
}
