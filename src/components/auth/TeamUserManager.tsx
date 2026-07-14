"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { US_PHONE_PATTERN } from "@/lib/validation";

type TeamScope = "admin" | "salon";
type TeamUser = { id: string; name?: string; email: string; phone?: string; role?: string; status?: string; permissions?: Record<string, boolean>; is_super_admin?: boolean; stylist_id?: string | null };
type Stylist = { id: string; name: string };
const adminPermissions = [["overview","Overview"],["submissions","Submissions"],["salons","Salons"],["customers","Customers"],["bookings","Bookings"],["quality","Quality & Performance"],["reviews","Reviews"],["finance","Payments & Finance"],["marketing","Marketing & Promotions"],["content","Content Management"],["support","Customer Support"],["subscriptions","Subscriptions"],["settings","Settings & Team"]] as const;
// Subscription and billing are intentionally owner-only. Team permissions
// control operational sections but never grant access to payment management.
const salonPermissions = [["overview","Overview"],["my_page","My Page"],["photos","Photos"],["styles","Styles & Pricing"],["stylists","Stylists"],["products","Products"],["availability","Availability & Calendar"],["bookings","Bookings"],["reviews","Reviews"],["earnings","Earnings & Payouts"],["promotions","Promotions"],["settings","Settings & Team"]] as const;

export default function TeamUserManager({ scope }: { scope: TeamScope }) {
  const options = scope === "admin" ? adminPermissions : salonPermissions;
  const endpoint = `/api/${scope}/team`;
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [selected, setSelected] = useState<TeamUser | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const auth = useCallback(async () => {
    const session = await getSessionForScope(scope === "admin" ? "admin" : "salon");
    if (!session) throw new Error("Your session has expired.");
    return { Authorization: `Bearer ${session.access_token}` };
  }, [scope]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { headers: await auth(), cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setUsers(Array.isArray(body.users) ? body.users : []);
      setStylists(Array.isArray(body.stylists) ? body.stylists : []);
      setCanManage(Boolean(body.can_manage));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load team users.");
    } finally {
      setLoading(false);
    }
  }, [auth, endpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    // Capture the DOM form before awaiting. React clears event.currentTarget
    // after an async boundary, which caused the old first-submit false error.
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const permissions = Object.fromEntries(options.map(([key]) => [key, form.get(`permission_${key}`) === "on"]));
    const payload = { id: selected?.id, name: form.get("name"), email: form.get("email"), phone: form.get("phone"), role: form.get("role"), stylist_id: form.get("stylist_id"), status: form.get("status"), permissions };
    try {
      const response = await fetch(endpoint, { method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json", ...(await auth()) }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(selected ? "User updated." : body.invitation_sent ? "User added and invitation sent. Access activates after sign-in." : "User added and linked to the account.");
      setSelected(null);
      formElement.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(user: TeamUser) {
    if (!window.confirm(`Remove access for ${user.email}?`)) return;
    try {
      const response = await fetch(`${endpoint}?id=${encodeURIComponent(user.id)}`, { method: "DELETE", headers: await auth() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSelected(null);
      setMessage("User access removed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove user.");
    }
  }

  if (loading) return <p className="text-sm text-ink/65">Loading team access...</p>;
  if (!canManage) return <section className="rounded-[14px] border border-plum/10 bg-white p-5"><h2 className="font-serif text-2xl text-plum">Authorized Users</h2><p className="mt-1 text-sm leading-6 text-ink/65">Team invitations and permission changes are restricted to the account owner or a Super Admin.</p><div className="mt-4 divide-y divide-plum/10">{users.map((user) => <div key={user.id} className="flex items-center justify-between gap-4 py-4"><span><b className="block">{user.name || user.email}</b><small className="mt-1 block text-sm text-ink/65">{user.email} · {user.phone || "No phone"} · {user.role || "Staff"}</small></span><span className="rounded-full bg-blush px-3 py-1 text-xs font-semibold text-plum">{user.is_super_admin ? "Super Admin" : user.status || "Invited"}</span></div>)}{!users.length ? <p className="py-8 text-center text-sm text-ink/60">No authorized users yet.</p> : null}</div></section>;

  const roleOptions = scope === "admin" ? ["Admin","Operations","Support","Finance","Content Editor"] : ["Manager","Front Desk","Stylist","Customer Service","Staff"];
  return <div className="space-y-5">
    <form key={selected?.id || "new"} onSubmit={submit} className="rounded-[14px] border border-plum/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl text-plum">{selected ? "Edit User" : "Add User"}</h2><p className="mt-1 text-sm leading-6 text-ink/65">{scope === "salon" ? "Enter the user details and choose every section they may access. Billing always remains with the salon owner." : "Enter the user details and choose every platform section they may access."}</p></div>{selected ? <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-plum/15 px-4 py-2 text-sm font-bold text-plum"><UserPlus size={16} className="mr-2 inline"/>Add another user</button> : null}</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field name="name" label="Full name" defaultValue={selected?.name}/><Field name="email" label="Email" type="email" defaultValue={selected?.email} readOnly={Boolean(selected)}/><Field name="phone" label="US mobile phone" type="tel" inputMode="tel" pattern={US_PHONE_PATTERN} title="Enter a valid US mobile number" defaultValue={selected?.phone}/><label className="text-sm font-semibold">Role<select name="role" defaultValue={selected?.role || (scope === "admin" ? "Admin" : "Staff")} className="mt-2 w-full rounded-lg border border-plum/15 bg-white p-3 font-normal">{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label><label className="text-sm font-semibold">Status<select name="status" defaultValue={selected?.status === "Inactive" ? "Inactive" : "Active"} className="mt-2 w-full rounded-lg border border-plum/15 bg-white p-3 font-normal"><option>Active</option><option>Inactive</option></select></label>{scope === "salon" ? <label className="text-sm font-semibold">Linked stylist profile<select name="stylist_id" defaultValue={selected?.stylist_id || ""} className="mt-2 w-full rounded-lg border border-plum/15 bg-white p-3 font-normal"><option value="">Not a stylist login</option>{stylists.map((stylist) => <option value={stylist.id} key={stylist.id}>{stylist.name}</option>)}</select></label> : null}</div>
      <fieldset className="mt-5"><legend className="flex items-center gap-2 font-semibold text-plum"><ShieldCheck size={18}/>Section permissions</legend><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{options.map(([key,label]) => <label key={key} className="flex items-center gap-3 rounded-lg border border-plum/10 bg-cream/40 p-3 text-sm"><input name={`permission_${key}`} type="checkbox" defaultChecked={Boolean(selected?.permissions?.[key])} className="h-4 w-4 accent-magenta"/>{label}</label>)}</div></fieldset>
      {message ? <p role="status" className="mt-4 rounded-lg bg-blush/40 p-3 text-sm text-plum">{message}</p> : null}
      <button disabled={submitting} className="mt-5 rounded-lg bg-magenta px-7 py-3 font-bold text-white disabled:opacity-60">{submitting ? "Saving…" : selected ? "Update User" : "Add User"}</button>
    </form>
    <section className="rounded-[14px] border border-plum/10 bg-white p-5"><h2 className="font-serif text-2xl text-plum">Authorized Users</h2><p className="mt-1 text-sm text-ink/60">New users appear here immediately after they are added.</p><div className="mt-4 divide-y divide-plum/10">{users.map((user) => <div key={user.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"><span><b className="block">{user.name || user.email}</b><small className="mt-1 block text-sm text-ink/65">{user.email} · {user.phone || "No phone"} · {user.role || "Staff"}</small></span><span className="flex items-center gap-2"><span className="rounded-full bg-blush px-3 py-1 text-xs font-semibold text-plum">{user.is_super_admin ? "Super Admin" : user.status || "Invited"}</span>{!user.is_super_admin ? <><button type="button" onClick={() => setSelected(user)} className="rounded-lg border border-plum/15 px-3 py-2 text-xs font-bold text-plum">Edit</button><button type="button" onClick={() => void remove(user)} className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700"><Trash2 size={15}/>Remove</button></> : null}</span></div>)}{!users.length ? <p className="py-8 text-center text-sm text-ink/60">No additional users have been added.</p> : null}</div></section>
  </div>;
}

function Field({ name, label, type = "text", defaultValue, readOnly = false, inputMode, pattern, title }: { name: string; label: string; type?: string; defaultValue?: string; readOnly?: boolean; inputMode?: "tel"; pattern?: string; title?: string }) {
  return <label className="text-sm font-semibold">{label}<input name={name} type={type} required defaultValue={defaultValue || ""} readOnly={readOnly} inputMode={inputMode} pattern={pattern} title={title} className="mt-2 w-full rounded-lg border border-plum/15 bg-white p-3 font-normal read-only:bg-cream/60"/></label>;
}
