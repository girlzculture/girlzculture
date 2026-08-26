"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clipboard, CreditCard, Mail, Scissors, Search, UserRound, UsersRound } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";

type Row = Record<string, unknown> & { id?: string; name?: string };
type PaymentMethod = "send_link" | "waive" | "paid_outside" | "collect_at_salon" | "no_deposit";

const paymentMethods: Array<{ value: PaymentMethod; title: string; detail: string }> = [
  { value: "send_link", title: "Send Stripe deposit link", detail: "Hold the selected time for 35 minutes. The booking is confirmed only after Stripe verifies payment." },
  { value: "waive", title: "Waive deposit", detail: "Confirm the appointment now with no deposit charged through Girlz Culture." },
  { value: "paid_outside", title: "Deposit paid outside Girlz Culture", detail: "Record that the salon or Platform Admin already received the deposit outside Stripe." },
  { value: "collect_at_salon", title: "Collect at salon", detail: "Confirm the booking now and leave the complete service amount due at the salon." },
  { value: "no_deposit", title: "No deposit required", detail: "Confirm the booking now under a no-deposit arrangement." },
];

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function styleName(style?: Row | null) {
  return String(style?.customer_facing_name || style?.name || "Service");
}

function stylistName(stylist?: Row | null) {
  return String(stylist?.name || "Any available stylist");
}

async function adminHeaders(json = false) {
  const session = await getSessionForScope("admin");
  if (!session) throw new Error("Your Platform Admin session has expired. Sign in again.");
  return {
    Authorization: `Bearer ${session.access_token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export default function AdminManualBookingWizard({
  salons,
  onCreated,
}: {
  salons: Row[];
  onCreated: () => Promise<void>;
}) {
  const [salonId, setSalonId] = useState("");
  const [salon, setSalon] = useState<Row | null>(null);
  const [styles, setStyles] = useState<Row[]>([]);
  const [stylists, setStylists] = useState<Row[]>([]);
  const [styleId, setStyleId] = useState("");
  const [stylistId, setStylistId] = useState("");
  const [date, setDate] = useState("");
  const [slotKey, setSlotKey] = useState("");
  const [slots, setSlots] = useState<Row[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<Row[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("send_link");
  const [depositPercentage, setDepositPercentage] = useState(10);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Row | null>(null);

  const selectedStyle = styles.find((row) => String(row.id) === styleId) || null;
  const selectedStylist = stylists.find((row) => String(row.id) === stylistId) || null;
  const filteredSlots = useMemo(
    () => slots.filter((row) => !stylistId || String(row.stylistId || row.stylist_id || "") === stylistId),
    [slots, stylistId],
  );
  const selectedSlot = filteredSlots.find((row) => {
    const key = `${String(row.value || "")}|${String(row.stylistId || row.stylist_id || "")}`;
    return key === slotKey;
  }) || null;
  const servicePrice = Number(selectedStyle?.base_price || selectedStyle?.price_display_min || 0);
  const calculatedDeposit = Math.round(servicePrice * depositPercentage) / 100;
  const selectedSalonName = String(salon?.name || salons.find((row) => String(row.id) === salonId)?.name || "Salon");

  useEffect(() => {
    fetch("/api/config?keys=booking.deposit_percentage", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        const value = Number(body?.config?.["booking.deposit_percentage"]);
        if (Number.isFinite(value) && value >= 0 && value <= 100) setDepositPercentage(value);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!salonId) {
      setSalon(null);
      setStyles([]);
      setStylists([]);
      setStyleId("");
      setStylistId("");
      setDate("");
      setSlots([]);
      setSlotKey("");
      return;
    }
    let live = true;
    setLoadingOptions(true);
    setNotice("");
    adminHeaders()
      .then((headers) => fetch(`/api/admin/bookings?salon_id=${encodeURIComponent(salonId)}`, { headers, cache: "no-store" }))
      .then(async (response) => {
        const body = await readApiResponse(response, "Unable to load this salon's booking options.");
        if (!response.ok) throw new Error(String(body.error || "Unable to load booking options."));
        return body as { salon?: Row; styles?: Row[]; stylists?: Row[] };
      })
      .then((body) => {
        if (!live) return;
        setSalon(body.salon || null);
        setStyles(Array.isArray(body.styles) ? body.styles : []);
        setStylists(Array.isArray(body.stylists) ? body.stylists : []);
        setStyleId("");
        setStylistId("");
        setDate("");
        setSlots([]);
        setSlotKey("");
      })
      .catch((error) => live && setNotice(error instanceof Error ? error.message : "Unable to load booking options."))
      .finally(() => live && setLoadingOptions(false));
    return () => { live = false; };
  }, [salonId]);

  useEffect(() => {
    const query = customerQuery.trim();
    if (query.length < 2) {
      setCustomers([]);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      adminHeaders()
        .then((headers) => fetch(`/api/admin/bookings?customer_q=${encodeURIComponent(query)}`, { headers, cache: "no-store" }))
        .then(async (response) => {
          const body = await readApiResponse(response, "Unable to search customers.");
          if (!response.ok) throw new Error(String(body.error || "Unable to search customers."));
          return body as { customers?: Row[] };
        })
        .then((body) => live && setCustomers(Array.isArray(body.customers) ? body.customers : []))
        .catch(() => live && setCustomers([]));
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [customerQuery]);

  useEffect(() => {
    if (!salonId || !styleId || !date) {
      setSlots([]);
      setSlotKey("");
      return;
    }
    let live = true;
    setLoadingSlots(true);
    setNotice("");
    const params = new URLSearchParams({ salon_id: salonId, style_id: styleId, date });
    if (guestEmail) params.set("guest_email", guestEmail);
    adminHeaders()
      .then((headers) => fetch(`/api/admin/bookings?${params}`, { headers, cache: "no-store" }))
      .then(async (response) => {
        const body = await readApiResponse(response, "Unable to load available appointment times.");
        if (!response.ok) throw new Error(String(body.error || "Unable to load appointment times."));
        return body as { slots?: Row[] };
      })
      .then((body) => {
        if (!live) return;
        setSlots(Array.isArray(body.slots) ? body.slots : []);
        setSlotKey("");
      })
      .catch((error) => live && setNotice(error instanceof Error ? error.message : "Unable to load appointment times."))
      .finally(() => live && setLoadingSlots(false));
    return () => { live = false; };
  }, [date, guestEmail, salonId, styleId]);

  function chooseCustomer(customer: Row) {
    setCustomerId(String(customer.id || ""));
    setGuestName(String(customer.name || ""));
    setGuestEmail(String(customer.email || ""));
    setGuestPhone(String(customer.phone || ""));
    setCustomerQuery(String(customer.name || customer.email || ""));
    setCustomers([]);
  }

  async function submit() {
    if (!salonId || !styleId || !date || !selectedSlot) {
      setNotice("Choose a salon, service, date, and available appointment time.");
      return;
    }
    if (!guestName.trim()) {
      setNotice("Enter the customer's name.");
      return;
    }
    if (paymentMethod === "send_link" && !guestEmail.trim()) {
      setNotice("Enter the customer's email before sending a Stripe deposit link.");
      return;
    }
    setSaving(true);
    setNotice("");
    setResult(null);
    try {
      const selectedSlotStylist = String(selectedSlot.stylistId || selectedSlot.stylist_id || stylistId || "");
      const response = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: await adminHeaders(true),
        body: JSON.stringify({
          salon_id: salonId,
          style_id: styleId,
          stylist_id: stylistId || selectedSlotStylist || null,
          customer_id: customerId || null,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          appointment_local: `${date}T${String(selectedSlot.value || "")}`,
          payment_method: paymentMethod,
        }),
      });
      const body = await readApiResponse(response, "Unable to prepare this booking.");
      if (!response.ok) throw new Error(String(body.error || "Unable to prepare this booking."));
      setResult(body as Row);
      if (body.payment_link) {
        setNotice(Array.isArray(body.warnings) && body.warnings.length
          ? `Secure payment link created. ${body.warnings.join(" ")}`
          : "Secure Stripe payment link created and delivery attempted. The booking will appear automatically after payment succeeds.");
      } else {
        setNotice(`Booking ${String(body.public_reference || createdBooking?.public_reference || "record")} was created and read back successfully.`);
        await onCreated();
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to prepare this booking.");
    } finally {
      setSaving(false);
    }
  }

  async function copyPaymentLink() {
    const link = String(result?.payment_link || "");
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setNotice("Secure Stripe payment link copied.");
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-magenta">Platform Admin booking assistance</p>
        <h1 className="mt-1 font-serif text-3xl text-plum sm:text-4xl">Create a customer booking</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">Select the exact salon, service, stylist, and verified available time. When a deposit is required, send a short-lived Stripe link so the customer—not the administrator—completes payment.</p>
      </header>

      {notice ? <p role="status" className="rounded-xl border border-magenta/20 bg-blush/40 p-4 text-sm leading-6 text-plum">{notice}</p> : null}

      <section className="rounded-2xl border border-plum/10 bg-white p-5">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-blush text-magenta"><UserRound size={17}/></span><div><p className="text-[10px] font-bold uppercase text-ink/45">Step 1</p><h2 className="font-serif text-xl text-plum">Customer</h2></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="relative text-xs font-bold md:col-span-3">Find an existing customer (optional)
            <span className="mt-1 flex min-h-11 items-center gap-2 rounded-lg border border-plum/15 px-3"><Search size={15}/><input value={customerQuery} onChange={(event) => { setCustomerQuery(event.target.value); setCustomerId(""); }} placeholder="Name, email, or phone" className="min-w-0 flex-1 font-normal outline-none"/></span>
            {customers.length ? <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-plum/10 bg-white p-2 shadow-xl">{customers.map((customer) => <button key={String(customer.id)} type="button" onClick={() => chooseCustomer(customer)} className="block w-full rounded-lg p-3 text-left hover:bg-blush/30"><b className="text-plum">{String(customer.name || "Customer")}</b><span className="mt-1 block font-normal text-ink/55">{String(customer.email || "No email")} · {String(customer.phone || "No phone")}</span></button>)}</div> : null}
          </label>
          <label className="text-xs font-bold">Customer name<input value={guestName} onChange={(event) => setGuestName(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal"/></label>
          <label className="text-xs font-bold">Customer email<input type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal"/></label>
          <label className="text-xs font-bold">US phone<input type="tel" value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal"/></label>
        </div>
      </section>

      <section className="rounded-2xl border border-plum/10 bg-white p-5">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-blush text-magenta"><Scissors size={17}/></span><div><p className="text-[10px] font-bold uppercase text-ink/45">Step 2</p><h2 className="font-serif text-xl text-plum">Salon and service</h2></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold">Salon<select value={salonId} onChange={(event) => setSalonId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"><option value="">Choose salon</option>{[...salons].sort((a,b)=>String(a.name || "").localeCompare(String(b.name || ""))).map((item)=><option key={String(item.id)} value={String(item.id)}>{String(item.name || "Salon")}</option>)}</select></label>
          <label className="text-xs font-bold">Service<select disabled={!salonId || loadingOptions} value={styleId} onChange={(event) => { setStyleId(event.target.value); setDate(""); setSlotKey(""); }} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal disabled:opacity-50"><option value="">{loadingOptions ? "Loading services…" : "Choose service"}</option>{styles.map((item)=><option key={String(item.id)} value={String(item.id)}>{styleName(item)} · {money(item.base_price || item.price_display_min)}</option>)}</select></label>
        </div>
      </section>

      <section className="rounded-2xl border border-plum/10 bg-white p-5">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-blush text-magenta"><UsersRound size={17}/></span><div><p className="text-[10px] font-bold uppercase text-ink/45">Step 3</p><h2 className="font-serif text-xl text-plum">Stylist and verified time</h2></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold">Stylist<select disabled={!styleId} value={stylistId} onChange={(event) => { setStylistId(event.target.value); setSlotKey(""); }} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal disabled:opacity-50"><option value="">Any available stylist</option>{stylists.map((item)=><option key={String(item.id)} value={String(item.id)}>{stylistName(item)}</option>)}</select></label>
          <label className="text-xs font-bold">Appointment date<input type="date" min={new Date().toISOString().slice(0,10)} disabled={!styleId} value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal disabled:opacity-50"/></label>
        </div>
        <div className="mt-4">
          <p className="text-xs font-bold">Available appointment times</p>
          {loadingSlots ? <p className="mt-2 text-xs text-ink/50">Checking salon and stylist availability…</p> : null}
          {!loadingSlots && date && !filteredSlots.length ? <p className="mt-2 rounded-lg bg-cream p-3 text-xs text-ink/55">No available times match this date and stylist. Choose another date or Any available stylist.</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">{filteredSlots.map((slot) => {
            const key = `${String(slot.value || "")}|${String(slot.stylistId || slot.stylist_id || "")}`;
            const active = slotKey === key;
            return <button key={key} type="button" onClick={() => setSlotKey(key)} className={`min-h-11 rounded-lg border px-4 text-xs font-bold ${active ? "border-magenta bg-magenta text-white" : "border-plum/15 bg-white text-plum"}`}>{String(slot.label || slot.value || "Time")}{!stylistId && (slot.stylistName || slot.stylist_name) ? <span className="ml-1 font-normal opacity-75">· {String(slot.stylistName || slot.stylist_name)}</span> : null}</button>;
          })}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-plum/10 bg-white p-5">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-blush text-magenta"><CreditCard size={17}/></span><div><p className="text-[10px] font-bold uppercase text-ink/45">Step 4</p><h2 className="font-serif text-xl text-plum">Deposit handling</h2></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{paymentMethods.map((method) => <label key={method.value} className={`cursor-pointer rounded-xl border p-4 ${paymentMethod === method.value ? "border-magenta bg-blush/30" : "border-plum/10"}`}><span className="flex items-start gap-3"><input type="radio" name="payment_method" value={method.value} checked={paymentMethod === method.value} onChange={() => setPaymentMethod(method.value)} className="mt-1 accent-magenta"/><span><b className="text-sm text-plum">{method.title}</b><span className="mt-1 block text-xs leading-5 text-ink/55">{method.detail}</span></span></span></label>)}</div>
        <p className="mt-3 text-[10px] leading-5 text-ink/50">Platform Admin overrides do not require an internal-reason field. The selected override, administrator, time, appointment, and amounts are recorded automatically in the audit history.</p>
      </section>

      <section className="rounded-2xl border border-plum/10 bg-charcoal p-5 text-white">
        <div className="flex items-center gap-3"><CalendarDays size={20}/><h2 className="font-serif text-xl">Review before creating</h2></div>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-white/55">Customer</dt><dd className="mt-1 font-bold">{guestName || "Not selected"}</dd></div>
          <div><dt className="text-white/55">Salon</dt><dd className="mt-1 font-bold">{selectedSalonName}</dd></div>
          <div><dt className="text-white/55">Service</dt><dd className="mt-1 font-bold">{styleName(selectedStyle)}</dd></div>
          <div><dt className="text-white/55">Stylist</dt><dd className="mt-1 font-bold">{stylistName(selectedStylist || (selectedSlot ? { name: String(selectedSlot.stylistName || selectedSlot.stylist_name || "Any available stylist") } : null))}</dd></div>
          <div><dt className="text-white/55">Appointment</dt><dd className="mt-1 font-bold">{date && selectedSlot ? `${date} · ${String(selectedSlot.label || selectedSlot.value || "")}` : "Not selected"}</dd></div>
          <div><dt className="text-white/55">Service total</dt><dd className="mt-1 font-bold">{money(servicePrice)}</dd></div>
          <div><dt className="text-white/55">Standard deposit</dt><dd className="mt-1 font-bold">{depositPercentage}% · {money(calculatedDeposit)}</dd></div>
          <div><dt className="text-white/55">Selected handling</dt><dd className="mt-1 font-bold">{paymentMethods.find((item)=>item.value===paymentMethod)?.title}</dd></div>
        </dl>
        <button type="button" disabled={saving} onClick={() => void submit()} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-lg bg-magenta px-6 text-sm font-bold text-white disabled:opacity-50">{saving ? "Preparing booking…" : <><Check size={17}/>Confirm and continue</>}</button>
      </section>

      {result?.payment_link ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-3"><Mail className="text-emerald-700" size={20}/><div><h2 className="font-serif text-xl text-emerald-950">Customer payment link ready</h2><p className="mt-1 text-xs text-emerald-900/70">The appointment remains a temporary hold until Stripe confirms payment.</p></div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input readOnly value={String(result.payment_link)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 text-xs"/><button type="button" onClick={() => void copyPaymentLink()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 text-xs font-bold text-white"><Clipboard size={15}/>Copy link</button><a href={String(result.payment_link)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-700 px-5 text-xs font-bold text-emerald-800">Open Stripe</a></div><p className="mt-3 text-[10px] text-emerald-900/65">Intent {String(result.booking_intent_id || "")} · expires {String(result.expires_at || "")}</p></section> : null}
    </div>
  );
}