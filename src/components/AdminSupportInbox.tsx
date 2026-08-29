"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Mail, MessageSquare, Search, Send } from "lucide-react";
import { readApiResponse } from "@/lib/apiResponseClient";
import { getSessionForScope } from "@/lib/supabase";
import { isComplaintSupportTicket } from "@/lib/supportTicketClassification";
import { useAdminListContext, useAdminQueryParam } from "@/components/admin/useAdminListContext";

export type AdminTicket = {
  id?: string | null;
  subject?: string | null;
  status?: string | null;
  requester_name?: string | null;
  requester_email?: string | null;
  category?: string | null;
  message?: string | null;
  admin_response?: string | null;
  complaint_id?: string | null;
  support_ticket_id?: string | null;
  booking_id?: string | null;
  salon_id?: string | null;
  customer_id?: string | null;
  priority?: string | null;
  responded_by?: string | null;
  admin_read_by?: string | null;
  assigned_to?: string | null;
  assigned_at?: string | null;
  booking_verified?: boolean | null;
  admin_read_at?: string | null;
  content_moderation_status?: string | null;
  content_moderation_reason?: string | null;
};
export type AdminAssignee = {
  id?: string | null;
  user_id?: string | null;
  name?: string | null;
  email?: string | null;
  status?: string | null;
};
export type AdminComplaint = {
  id?: string | null;
  category?: string | null;
  type?: string | null;
  description?: string | null;
  issue_description?: string | null;
  status?: string | null;
  complainant_name?: string | null;
  complainant_email?: string | null;
  booking_verified?: boolean | null;
  support_ticket_id?: string | null;
  booking_id?: string | null;
  salon_id?: string | null;
  customer_id?: string | null;
  created_at?: string | null;
  content_moderation_status?: string | null;
  content_moderation_reason?: string | null;
};

type InboxMode = "support" | "complaints";
const defaultStatuses = ["Open", "In Progress", "Waiting on Customer", "Resolved", "Closed"];

function scopedTickets(initialTickets: AdminTicket[], mode: InboxMode) {
  return (Array.isArray(initialTickets) ? initialTickets : []).filter((ticket) => mode === "complaints"
    ? isComplaintSupportTicket(ticket)
    : !isComplaintSupportTicket(ticket));
}

function complaintCards(initialComplaints: AdminComplaint[], initialTickets: AdminTicket[]) {
  const linkedTickets = new Map((Array.isArray(initialTickets) ? initialTickets : [])
    .filter((ticket) => ticket.complaint_id)
    .map((ticket) => [String(ticket.complaint_id), ticket]));
  return (Array.isArray(initialComplaints) ? initialComplaints : []).map((complaint): AdminTicket => {
    const linked = linkedTickets.get(String(complaint.id || ""));
    return {
      id: complaint.id,
      complaint_id: complaint.id,
      subject: complaint.category || complaint.type || "Customer complaint",
      category: "Complaint",
      status: complaint.status || linked?.status || "Open",
      requester_name: complaint.complainant_name || linked?.requester_name || "Customer",
      requester_email: complaint.complainant_email || linked?.requester_email || null,
      message: complaint.issue_description || complaint.description || linked?.message || "No written description was recorded.",
      admin_response: linked?.admin_response,
      booking_verified: complaint.booking_verified,
      admin_read_at: linked?.admin_read_at,
      support_ticket_id: linked?.id || complaint.support_ticket_id,
      booking_id: complaint.booking_id,
      salon_id: complaint.salon_id,
      customer_id: complaint.customer_id,
      priority: linked?.priority,
      responded_by: linked?.responded_by,
      admin_read_by: linked?.admin_read_by,
      assigned_to: linked?.assigned_to,
      assigned_at: linked?.assigned_at,
      content_moderation_status: complaint.content_moderation_status || linked?.content_moderation_status,
      content_moderation_reason: complaint.content_moderation_reason || linked?.content_moderation_reason,
    };
  });
}

export default function AdminSupportInbox({ initialTickets = [], initialComplaints = [], initialAssignees = [], mode = "support" }: { initialTickets?: AdminTicket[]; initialComplaints?: AdminComplaint[]; initialAssignees?: AdminAssignee[]; mode?: InboxMode }) {
  const tickets = mode === "complaints"
    ? complaintCards(initialComplaints, initialTickets)
    : scopedTickets(initialTickets, mode);
  const { query, setQuery, status: filter, setStatus: setFilter } = useAdminListContext("All");
  const [owner, setOwner] = useAdminQueryParam("owner", "All");
  const [priority, setPriority] = useAdminQueryParam("priority", "All");
  const [waiting, setWaiting] = useAdminQueryParam("waiting", "All");
  const [statuses, setStatuses] = useState(defaultStatuses);
  useEffect(() => { let live = true; void fetch("/api/config?keys=support.ticket_statuses", { cache: "no-store" }).then((response) => response.json()).then((body) => { const configured = body?.config?.["support.ticket_statuses"]; if (live && Array.isArray(configured) && configured.length) setStatuses(configured.map(String).filter(Boolean).slice(0,20)); }).catch(() => undefined); return () => { live = false; }; }, []);
  const assigneeLabels = useMemo(() => new Map((Array.isArray(initialAssignees) ? initialAssignees : []).map((admin) => [String(admin.user_id || admin.id || ""), String(admin.name || admin.email || "Administrator")])), [initialAssignees]);
  const ownerOptions = useMemo(() => Array.from(new Set(tickets.map((ticket) => String(ticket.assigned_to || "")).filter(Boolean))).sort(), [tickets]);
  const priorityOptions = useMemo(() => Array.from(new Set(tickets.map((ticket) => String(ticket.priority || "")).filter(Boolean))).sort(), [tickets]);
  const visible = useMemo(() => tickets.filter((ticket) => {
    const assignedOwner = String(ticket.assigned_to || "");
    const assignedPriority = String(ticket.priority || "");
    const ticketStatus = String(ticket.status || "");
    const matchesStatus = filter === "All" || ticket.status === filter;
    const matchesOwner = owner === "All" || (owner === "Unassigned" ? !assignedOwner : assignedOwner === owner);
    const matchesPriority = priority === "All" || (priority === "Not prioritized" ? !assignedPriority : assignedPriority === priority);
    const isWaiting = ticketStatus.toLowerCase().includes("waiting");
    const matchesWaiting = waiting === "All" || (waiting === "Waiting" ? isWaiting : !isWaiting);
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || [ticket.id, ticket.support_ticket_id, ticket.complaint_id, ticket.booking_id, ticket.salon_id, ticket.customer_id, ticket.subject, ticket.requester_name, ticket.requester_email, ticket.category, ticket.message].some((value) => String(value || "").toLowerCase().includes(term));
    return matchesStatus && matchesOwner && matchesPriority && matchesWaiting && matchesQuery;
  }), [filter, owner, priority, query, tickets, waiting]);
  const heading = mode === "complaints" ? "Complaint queue" : "Support inbox";
  const emptyLabel = mode === "complaints" ? "complaints" : "support requests";
  const returnPath = `/admin/${mode}?${new URLSearchParams({ ...(filter !== "All" ? { status: filter } : {}), ...(owner !== "All" ? { owner } : {}), ...(priority !== "All" ? { priority } : {}), ...(waiting !== "All" ? { waiting } : {}), ...(query ? { q: query } : {}) })}`.replace(/\?$/, "");
  return <section data-admin-record-landing className="rounded-[14px] border border-plum/10 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-serif text-2xl text-plum">{heading}</h2><p className="mt-1 text-xs text-ink/55">{tickets.filter((ticket) => ticket.status === "Open").length} open · {tickets.filter((ticket) => !ticket.admin_read_at).length} unread</p></div><div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-5"><label className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-plum/10 px-3 sm:col-span-2 xl:min-w-64"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${emptyLabel} or reference`} className="min-w-0 flex-1 outline-none"/></label><select aria-label="Status" value={filter} onChange={(event) => setFilter(event.target.value)} className="min-h-11 rounded-lg border border-plum/10 px-3 text-xs"><option>All</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select><select aria-label="Assigned admin" value={owner} onChange={(event) => setOwner(event.target.value)} className="min-h-11 rounded-lg border border-plum/10 px-3 text-xs"><option>All</option><option>Unassigned</option>{ownerOptions.map((value) => <option key={value} value={value}>{assigneeLabels.get(value) || `Administrator ${value.slice(0, 8)}`}</option>)}</select><select aria-label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)} className="min-h-11 rounded-lg border border-plum/10 px-3 text-xs"><option>All</option><option>Not prioritized</option>{priorityOptions.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Waiting state" value={waiting} onChange={(event) => setWaiting(event.target.value)} className="min-h-11 rounded-lg border border-plum/10 px-3 text-xs"><option>All</option><option>Waiting</option><option>Not waiting</option></select></div></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.length ? visible.map((ticket) => {
      const assignedOwner = String(ticket.assigned_to || "");
      return <Link key={ticket.id || ticket.subject || "ticket"} href={`/admin/${mode}/${ticket.id}?return=${encodeURIComponent(returnPath)}`} className="relative rounded-xl border border-plum/10 p-4 text-left transition hover:border-magenta hover:bg-blush/20">
        {!ticket.admin_read_at ? <span role="img" aria-label="Unread" className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-magenta"/> : null}
        <div className="flex items-center justify-between gap-2 pr-5"><b className="line-clamp-1 text-sm text-plum">{ticket.subject}</b><span className="rounded-full bg-blush px-2 py-1 text-[9px] font-bold text-magenta">{ticket.status}</span></div>
        <p className="mt-1 text-xs text-ink/55">{ticket.requester_name} · {ticket.category}</p>
        <p className="mt-1 text-[10px] text-ink/45">{assignedOwner ? assigneeLabels.get(assignedOwner) || `Administrator ${assignedOwner.slice(0, 8)}` : "Unassigned"} · {ticket.priority || "Not prioritized"}</p>
        {ticket.category === "Complaint" ? <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-bold ${ticket.booking_verified ? "bg-emerald-100 gc-text-success" : "bg-amber/15 gc-text-warning"}`}>{ticket.booking_verified ? "Booking verified" : "Verification required"}</span> : null}
        {ticket.content_moderation_status === "Flagged" ? <span className="ml-2 mt-2 inline-flex rounded-full bg-red-100 px-2 py-1 text-[9px] font-bold gc-text-danger">Content review required</span> : null}
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink/70">{ticket.message}</p>
        <span className="mt-3 inline-flex text-xs font-bold text-magenta">Open complete record →</span>
      </Link>;
    }) : <p className="col-span-full rounded-xl bg-blush/20 p-8 text-center text-sm text-ink/55">No {emptyLabel} match this view.</p>}</div>
  </section>;
}

export function AdminSupportDetail({ ticket: initialTicket, mode, assignees = [], onSaved, onRead }: { ticket?: AdminTicket; mode: InboxMode; assignees?: AdminAssignee[]; onSaved?: () => Promise<void>; onRead?: (mode: InboxMode) => void }) {
  const [ticket, setTicket] = useState(initialTicket);
  const [response, setResponse] = useState("");
  const [statuses, setStatuses] = useState(defaultStatuses);
  const [responseStatus, setResponseStatus] = useState(initialTicket?.status && defaultStatuses.includes(initialTicket.status) ? initialTicket.status : "Resolved");
  const [assignedTo, setAssignedTo] = useState(initialTicket?.assigned_to || "");
  const [ticketPriority, setTicketPriority] = useState(initialTicket?.priority || "Normal");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const responseRequestKey = useRef("");
  useEffect(() => { let live = true; void fetch("/api/config?keys=support.ticket_statuses", { cache: "no-store" }).then((response) => response.json()).then((body) => { const configured = body?.config?.["support.ticket_statuses"]; if (live && Array.isArray(configured) && configured.length) { const next = configured.map(String).filter(Boolean).slice(0,20); setStatuses(next); if (ticket?.status && next.includes(ticket.status)) setResponseStatus(ticket.status); } }).catch(() => undefined); return () => { live = false; }; }, [ticket?.status]);
  useEffect(() => { if (!ticket?.id || ticket.admin_read_at) return; let live = true; void (async () => { try { const session = await getSessionForScope("admin"); if (!session) throw new Error("Your admin session has expired."); const request = await fetch(`/api/admin/support/${ticket.id}/read`, { method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}` } }); const body = await readApiResponse(request, "Unable to mark this request as read."); if (!request.ok) throw new Error(body.error || "Unable to mark this request as read."); if (live) { setTicket((current) => ({ ...(current || {}), ...(body.data as AdminTicket) })); onRead?.(mode); } } catch (error) { if (live) setNotice(error instanceof Error ? error.message : "Unable to mark this request as read."); } })(); return () => { live = false; }; }, [mode, onRead, ticket?.admin_read_at, ticket?.id]);
  if (!ticket) return <section className="rounded-[14px] border border-dashed border-plum/20 bg-white p-8 text-center"><h2 className="font-serif text-2xl text-plum">{mode === "complaints" ? "Complaint" : "Support request"} unavailable</h2><p className="mt-2 text-sm text-ink/55">The record was removed or is outside this administrator&apos;s permissions.</p></section>;
  async function respond(event: FormEvent) {
    event.preventDefault();
    if (!ticket?.id) return;
    setSending(true); setNotice("");
    try { const session = await getSessionForScope("admin"); if (!session) throw new Error("Your admin session has expired."); responseRequestKey.current ||= crypto.randomUUID(); const request = await fetch(`/api/admin/support/${ticket.id}/respond`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ response, status: responseStatus, idempotency_key: responseRequestKey.current }) }); const body = await readApiResponse(request, "Unable to save this response."); if (!request.ok) throw new Error(body.error || "Unable to save this response."); setTicket(body.data as AdminTicket); const deliveryComplete=["Sent","NotRequired"].includes(String(body.email_delivery||"")); if(deliveryComplete){ setResponse(""); responseRequestKey.current=""; } setNotice(deliveryComplete ? `Response saved and read back. This request is now ${responseStatus.toLowerCase()}.` : `Response saved. Email delivery is queued for retry; choose Save response again to retry the same delivery safely.`); await onSaved?.(); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save this response."); } finally { setSending(false); }
  }
  async function saveAssignment(event: FormEvent) {
    event.preventDefault();
    if (!ticket?.id) return;
    setAssigning(true); setNotice("");
    try {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Your admin session has expired.");
      const request = await fetch(`/api/admin/support/${ticket.id}/assignment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ assigned_to: assignedTo || null, priority: ticketPriority }),
      });
      const body = await readApiResponse(request, "Unable to save this assignment.");
      if (!request.ok) throw new Error(body.error || "Unable to save this assignment.");
      setTicket(body.data as AdminTicket);
      setNotice("Assignment and priority saved and read back successfully.");
      await onSaved?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save this assignment.");
    } finally {
      setAssigning(false);
    }
  }
  return <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
    <section className="rounded-[14px] border border-plum/10 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-[10px] font-bold uppercase tracking-[.15em] text-magenta">{ticket.category}</span><h2 className="mt-1 font-serif text-3xl text-plum">{ticket.subject}</h2>{ticket.category === "Complaint" ? <p className={`mt-2 text-xs font-bold ${ticket.booking_verified ? "gc-text-success" : "gc-text-warning"}`}>{ticket.booking_verified ? "Verified against a booking — included in quality monitoring" : "Not booking-verified — excluded from automated quality scoring"}</p> : null}</div><span className="rounded-full bg-blush px-3 py-1.5 text-xs font-bold text-magenta">{ticket.status}</span></div><div className="mt-5 grid gap-3 rounded-xl bg-cream p-4 text-sm sm:grid-cols-2"><span className="flex items-center gap-2"><MessageSquare size={16} className="text-magenta"/>{ticket.requester_name}</span><a href={`mailto:${ticket.requester_email}`} className="flex items-center gap-2 text-magenta"><Mail size={16}/>{ticket.requester_email}</a></div>{ticket.content_moderation_status === "Flagged" ? <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm gc-text-danger"><b>Content review required</b><p className="mt-1">The report was preserved so evidence is not lost and is queued for human review{ticket.content_moderation_reason ? ` (${ticket.content_moderation_reason})` : ""}.</p></div> : null}<div className="mt-5 rounded-xl border border-plum/10 p-5"><p className="whitespace-pre-wrap text-sm leading-7 text-ink/75">{ticket.message}</p></div>{ticket.admin_response ? <div className="mt-4 rounded-xl bg-blush/30 p-5"><b className="text-sm text-plum">Latest admin response</b><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{ticket.admin_response}</p></div> : null}</section>
    <section className="h-fit rounded-[14px] border border-plum/10 bg-white p-5">
      <h2 className="font-serif text-2xl text-plum">Ownership and response</h2>
      <form onSubmit={saveAssignment} className="mt-4 rounded-xl bg-cream p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-plum">Assigned administrator<select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-plum/10 bg-white px-3 font-normal"><option value="">Unassigned</option>{assignees.filter((admin) => admin.status !== "Inactive").map((admin) => { const value = String(admin.user_id || admin.id || ""); return value ? <option key={value} value={value}>{admin.name || admin.email || "Administrator"}</option> : null; })}</select></label>
          <label className="text-xs font-bold text-plum">Priority<select value={ticketPriority} onChange={(event) => setTicketPriority(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-plum/10 bg-white px-3 font-normal">{["Low", "Normal", "High", "Urgent"].map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <button disabled={assigning} className="mt-3 min-h-10 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta gc-disabled-control">{assigning ? "Saving assignment…" : "Save assignment"}</button>
      </form>
      <form onSubmit={respond} className="mt-5 border-t border-plum/10 pt-5"><label className="text-xs font-bold text-plum">Response<textarea required value={response} onChange={(event) => { responseRequestKey.current=""; setResponse(event.target.value); }} rows={8} placeholder="Write a helpful response…" className="mt-2 w-full rounded-xl border border-plum/10 p-4 font-normal outline-none focus:border-magenta"/></label><label className="mt-3 block text-xs font-bold text-plum">Status after response<select value={responseStatus} onChange={(event) => { responseRequestKey.current=""; setResponseStatus(event.target.value); }} className="mt-2 min-h-11 w-full rounded-xl border border-plum/10 bg-white px-3 font-normal">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>{notice ? <p role="status" className="mt-3 rounded-lg bg-blush/40 p-3 text-sm text-plum">{notice}</p> : null}<button disabled={sending} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-6 text-sm font-bold text-white gc-disabled-control"><Send size={16}/>{sending ? "Saving…" : "Save response"}</button></form>
    </section>
  </div>;
}
