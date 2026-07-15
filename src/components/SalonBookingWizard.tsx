/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BriefcaseBusiness, CalendarDays, Check, Clock3, LockKeyhole, ShieldCheck, Star, UserRound, UsersRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SafeImage from "@/components/site/SafeImage";
import { EMAIL_PATTERN, formatUsPhoneInput, isValidEmail, isValidUsPhone, US_PHONE_PATTERN } from "@/lib/validation";
import { isSalonClosedToday } from "@/lib/salonOpenStatus";

type Row = Record<string, any>;
type Props = { salon: Row; styles: Row[]; stylists: Row[] };
type Slot = { value: string; label: string; stylistId: string | null };
type SuggestedSlot = Slot & { date: string; timeZone?: string };
type ServiceOption = { value: string; label: string; price_add: number; duration_add_minutes: number };
type ServiceOptionGroup = { id: string; label: string; selection: "single" | "multiple"; required: boolean; options: ServiceOption[] };

function options(raw: any) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((item: any) => typeof item === "string" ? { label: item, value: item, price_add: 0 } : { label: item.label || item.name || item.value, value: item.value || item.label || item.name, price_add: Number(item.price_add || item.price || 0) });
  return Object.entries(raw).map(([key, value]: any) => ({ label: value.label || value.name || key, value: value.value || key, price_add: Number(value.price_add || value.price || 0) }));
}

function serviceOptionGroups(raw: unknown): ServiceOptionGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((group: any) => ({
    id: String(group?.id || ""),
    label: String(group?.label || "Options"),
    selection: group?.selection === "multiple" ? "multiple" as const : "single" as const,
    required: group?.required === true,
    options: Array.isArray(group?.options) ? group.options.map((item: any) => ({
      value: String(item?.value || item?.label || ""),
      label: String(item?.label || item?.value || ""),
      price_add: Number(item?.price_add || 0),
      duration_add_minutes: Number(item?.duration_add_minutes || 0),
    })).filter((item: ServiceOption) => item.value && item.label) : [],
  })).filter((group: ServiceOptionGroup) => group.id && group.options.length);
}

const money = (value: number) => `$${value.toFixed(2)}`;
export default function SalonBookingWizard({ salon, styles, stylists }: Props) {
  const closedToday = isSalonClosedToday(salon);
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [styleId, setStyleId] = useState(styles[0]?.id || "");
  const requestedStylist = searchParams.get("stylist");
  const [stylistId, setStylistId] = useState(requestedStylist && stylists.some((row) => row.id === requestedStylist) ? requestedStylist : "any");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [size, setSize] = useState("");
  const [length, setLength] = useState("");
  const [addons, setAddons] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [clientNotes, setClientNotes] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoMessage, setPromoMessage] = useState("");
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState(searchParams.get("payment") === "cancelled" ? "Checkout was cancelled. Your appointment was not booked." : closedToday ? "This salon is closed today. You can still choose a future date." : "");
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState<Row | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityReason, setAvailabilityReason] = useState("");
  const [suggested, setSuggested] = useState<SuggestedSlot | null>(null);

  const style = styles.find((row) => row.id === styleId) || styles[0];
  const sizeOptions = options(style?.size_options);
  const lengthOptions = options(style?.length_options);
  const addonOptions = options(style?.addons);
  const genericOptionGroups = serviceOptionGroups(style?.option_groups);
  const selectedGenericOptions = genericOptionGroups.flatMap((group) => group.options.filter((item) => (selectedOptions[group.id] || []).includes(item.value)));
  const genericOptionPrice = selectedGenericOptions.reduce((sum, item) => sum + item.price_add, 0);
  const genericDurationAdjustmentMinutes = selectedGenericOptions.reduce((sum, item) => sum + item.duration_add_minutes, 0);
  const total = Math.max(0, Number(style?.price_display_min || style?.base_price || 0)
    + Number(sizeOptions.find((item: Row) => item.value === size)?.price_add || 0)
    + Number(lengthOptions.find((item: Row) => item.value === length)?.price_add || 0)
    + addonOptions.filter((item: Row) => addons.includes(item.value)).reduce((sum: number, item: Row) => sum + item.price_add, 0)
    + genericOptionPrice);
  const originalDeposit = Number((total * 0.1).toFixed(2));
  const calculatedDeposit = Math.max(0, Number((originalDeposit - promoDiscount).toFixed(2)));
  const deposit = Math.round(calculatedDeposit * 100) >= 50 ? calculatedDeposit : 0;
  const balance = total - deposit;

  useEffect(() => {
    setSize("");
    setLength("");
    setAddons([]);
    setSelectedOptions({});
  }, [styleId]);

  useEffect(() => {
    if (date) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(`${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`);
  }, [date]);

  useEffect(() => {
    if (!date || !salon.id || !style?.id) return;
    let current = true;
    setAvailabilityLoading(true);
    setSuggested(null);
    const params = new URLSearchParams({ salon_id: salon.id, style_id: style.id, date });
    if (stylistId !== "any") params.set("stylist_id", stylistId);
    fetch(`/api/booking-availability?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load availability.");
        if (!current) return;
        const nextSlots = (body.slots || []) as Slot[];
        setSlots(nextSlots);
        setAvailabilityReason(body.reason || "");
        setSuggested(body.next || null);
        setTime((previous) => nextSlots.some((slot) => slot.value === previous) ? previous : nextSlots[0]?.value || "");
      })
      .catch((error) => { if (current) { setSlots([]); setAvailabilityReason(error instanceof Error ? error.message : "Unable to load availability."); } })
      .finally(() => { if (current) setAvailabilityLoading(false); });
    return () => { current = false; };
  }, [date, salon.id, style?.id, stylistId]);

  useEffect(() => {
    const sessionId = searchParams.get("booking_session");
    if (!sessionId) return;
    let cancelled = false;
    setSaving(true);
    setStep(5);
    const poll = async (attempt = 0): Promise<void> => {
      const response = await fetch(`/api/stripe/booking-status?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const body = await response.json();
      if (cancelled) return;
      if (body.status === "Paid" && body.booking) { setConfirmed(body.booking); setSaving(false); return; }
      if (attempt < 8) { window.setTimeout(() => void poll(attempt + 1), 1200); return; }
      setMessage("Payment was received and your booking is still being finalized. Refresh this page in a moment.");
      setSaving(false);
    };
    void poll().catch((error) => { if (!cancelled) { setMessage(error instanceof Error ? error.message : "Unable to confirm the booking."); setSaving(false); } });
    return () => { cancelled = true; };
  }, [searchParams]);

  function applySuggested(slot: SuggestedSlot) {
    setDate(slot.date);
    setTime(slot.value);
    setSuggested(null);
    setMessage(`Next available: ${slot.date} at ${slot.label}.`);
    setStep(3);
  }

  async function applyPromo() {
    setPromoMessage(""); setPromoDiscount(0);
    if (!promoCode.trim()) { setPromoMessage("Enter a promo code."); return; }
    try {
      const response = await fetch("/api/promo/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: promoCode, purpose: "booking", amount: originalDeposit }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to apply promo code.");
      setPromoCode(body.code); setPromoDiscount(Number(body.discount || 0)); setPromoMessage(`${body.code} applied: ${money(Number(body.discount || 0))} off your deposit.`);
    } catch (error) { setPromoMessage(error instanceof Error ? error.message : "Unable to apply promo code."); }
  }

  async function reserve() {
    const errors:Record<string,string>={};
    if (!guest.name.trim()) errors.name="This field is required";
    if (!guest.email.trim()) errors.email="This field is required"; else if(!isValidEmail(guest.email))errors.email="Enter a valid email address";
    if (!guest.phone.trim()) errors.phone="This field is required"; else if(!isValidUsPhone(guest.phone))errors.phone="Enter a valid US phone number";
    if (!consent) errors.consent="This confirmation is required";
    if (!date || !time || !slots.some((slot) => slot.value === time)) errors.date_time="Choose an available appointment time";
    if(Object.keys(errors).length){setFieldErrors(errors);setMessage("Check the highlighted fields and try again.");setStep(errors.date_time?3:4);return;}
    if (!salon?.id || !style?.id) { setMessage("The salon or style selection is missing. Return to the salon page and try again."); return; }
    setFieldErrors({});
    setSaving(true);
    setMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/stripe/booking-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          salon_id: salon.id,
          style_id: style.id,
          stylist_id: stylistId === "any" ? null : stylistId,
          selected_size: size || null,
          selected_length: length || null,
          selected_addons: addons,
          selected_options: selectedOptions,
          client_notes: clientNotes,
          promo_code: promoCode.trim() || null,
          appointment_local: `${date}T${time}`,
          guest_name: guest.name,
          guest_email: guest.email,
          guest_phone: guest.phone,
          website: "",
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.next_available) setSuggested(body.next_available as SuggestedSlot);
        throw new Error(body.error || "Unable to start checkout.");
      }
      if (body?.booking) {
        setConfirmed(body.booking);
        setStep(5);
        setSaving(false);
        return;
      }
      if (!body?.url) throw new Error("Stripe did not return a checkout page. No payment was taken.");
      window.location.assign(body.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start checkout.");
      setSaving(false);
    }
  }

  const panels = [
    <StylePanel key="style" {...{ style, styles, styleId, setStyleId, size, setSize, length, setLength, addons, setAddons, selectedOptions, setSelectedOptions, genericOptionGroups, total }} />,
    <StylistPanel key="stylist" stylists={stylists} value={stylistId} setValue={setStylistId} />,
    <DatePanel key="date" {...{ date, setDate, time, setTime, slots, style, availabilityLoading, availabilityReason, suggested, applySuggested, fieldErrors, setFieldErrors }} />,
    <div key="review"><ReviewPanel {...{ style, stylists, stylistId, date, time, slots, total, deposit, originalDeposit, promoDiscount, promoCode, setPromoCode, promoMessage, applyPromo, balance, guest, setGuest, consent, setConsent, clientNotes, setClientNotes, genericDurationAdjustmentMinutes, fieldErrors, setFieldErrors }} /><PromoField {...{ promoCode, setPromoCode, setPromoDiscount, setPromoMessage, promoMessage, applyPromo, promoDiscount, originalDeposit, deposit }} /></div>,
    <PaymentPanel key="payment" confirmed={confirmed} deposit={deposit} saving={saving} reserve={reserve} suggested={suggested} applySuggested={applySuggested} />,
  ];

  return <main className="min-h-screen bg-cream text-ink"><header className="flex h-16 items-center justify-between border-b border-plum/10 bg-white/75 px-5 lg:px-10"><Link href="/" className="font-serif text-2xl font-bold text-plum">Girlz Culture</Link><nav className="hidden items-center gap-7 text-sm md:flex"><Link href="/salons">Discover</Link><Link href="/styles">Styles</Link><Link href="/account?tab=upcoming">Bookings</Link><Link href="/account?tab=favorites">Saved</Link></nav></header><div className="mx-auto max-w-[1760px] px-4 py-7 lg:px-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-serif text-4xl font-semibold text-plum">Book Your Appointment</h1><p className="mt-2 text-ink/60">Your beauty, your way. We make it effortless.</p></div><p className="flex items-center gap-2 text-sm font-semibold text-amber"><ShieldCheck size={18} aria-hidden="true" />Secure booking</p></div><div className="mt-7 flex items-center justify-between gap-2">{["Choose Style", "Choose Stylist", "Date & Time", "Review & Confirm", "Pay Deposit"].map((label, index) => <button key={label} onClick={() => setStep(index + 1)} className="flex min-w-0 items-center gap-2 text-[10px] sm:text-xs"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${step === index + 1 ? "border-magenta bg-magenta text-white" : "border-plum/20"}`}>{index + 1}</span><span className="hidden md:inline">{label}</span></button>)}</div>{message ? <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}<div className="mt-6 hidden grid-cols-5 gap-3 xl:grid">{panels.map((panel, index) => <section key={index} className={`min-w-0 rounded-[15px] border bg-white/70 p-4 ${step === index + 1 ? "border-magenta" : "border-plum/10"}`}><PanelTitle n={index + 1} title={["Choose Style & Options", "Choose Your Stylist", "Select Date & Time", "Review & Confirm", "Pay Deposit"][index]} />{panel}{index < 4 ? <button onClick={() => setStep(index + 2)} className="mt-5 w-full rounded-[8px] bg-magenta py-3 text-xs font-bold text-white">Continue</button> : null}</section>)}</div><section className="mt-5 rounded-[15px] border border-plum/10 bg-white/75 p-4 xl:hidden"><PanelTitle n={step} title={["Choose Style & Options", "Choose Your Stylist", "Select Date & Time", "Review & Confirm", "Pay Deposit"][step - 1]} />{panels[step - 1]}{step < 5 ? <button onClick={() => setStep(step + 1)} className="mt-5 w-full rounded-[8px] bg-magenta py-3 font-bold text-white">Continue</button> : null}</section><div className="mt-7 grid gap-4 rounded-[14px] bg-blush/35 p-5 sm:grid-cols-4">{[[ShieldCheck, "Salon information"], [LockKeyhole, "Secure Payments"], [CalendarDays, "Flexible Scheduling"], [Star, "Customer Reviews"]].map(([Icon, label]) => <div key={label as string} className="flex items-center gap-3 text-xs font-semibold"><Icon className="text-plum" />{label as string}</div>)}</div></div></main>;
}

function PanelTitle({ n, title }: { n: number; title: string }) { return <h2 className="mb-4 flex items-center gap-2 font-serif text-lg font-semibold text-plum"><span className="grid h-6 w-6 place-items-center rounded-full bg-plum text-xs text-white">{n}</span>{title}</h2>; }
function StylePanel(props: Row) {
  const uploadedPhoto = props.style?.photos?.[0];
  const groups = props.genericOptionGroups as ServiceOptionGroup[];
  return <div>
    <div className="flex gap-3 rounded-[10px] border p-2">{uploadedPhoto ? <SafeImage src={uploadedPhoto} fallbackSrc={uploadedPhoto} alt={props.style?.name || "Service"} className="h-16 w-16 rounded-lg object-cover" /> : null}<div><b className="text-sm">{props.style?.name || "Choose a service"}</b><p className="text-[10px] text-ink/55">{[props.style?.service_category?.name, props.style?.category].filter(Boolean).join(" · ")}</p></div></div>
    <label className="mt-3 block text-[10px] font-bold">Service<select value={props.styleId} onChange={(event) => props.setStyleId(event.target.value)} className="mt-1 w-full rounded-lg border p-2">{props.styles.map((row: Row) => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
    {groups.length ? groups.map((group) => <GenericOptionChoices key={group.id} group={group} selected={props.selectedOptions[group.id] || []} setSelected={(values) => props.setSelectedOptions((current: Record<string, string[]>) => ({ ...current, [group.id]: values }))} />) : <><Choice label="Size" items={props.style ? options(props.style.size_options) : []} value={props.size} onChange={props.setSize} /><Choice label="Length" items={props.style ? options(props.style.length_options) : []} value={props.length} onChange={props.setLength} /><div className="mt-3"><b className="text-[10px]">Add-ons</b>{(props.style ? options(props.style.addons) : []).map((item: Row) => <label key={item.value} className="flex justify-between py-1 text-[10px]"><span><input type="checkbox" checked={props.addons.includes(item.value)} onChange={() => props.setAddons((current: string[]) => current.includes(item.value) ? current.filter((value) => value !== item.value) : [...current, item.value])} /> {item.label}</span><span>+{money(item.price_add)}</span></label>)}</div></>}
    <div className="mt-4 flex justify-between rounded-lg bg-blush/40 p-3"><b className="text-xs">Estimated Total</b><b className="text-plum">{money(props.total)}</b></div>
  </div>;
}
function Choice({ label, items, value, onChange }: { label: string; items: Row[]; value: string; onChange: (value: string) => void }) { if (!items.length) return null; return <div className="mt-3"><b className="text-[10px]">{label}</b><div className="mt-1 flex flex-wrap gap-1">{items.map((item) => <button type="button" key={String(item.value)} onClick={() => onChange(String(item.value))} className={`rounded border px-2 py-1 text-[9px] ${value === item.value ? "border-magenta bg-blush" : ""}`}>{String(item.label)}</button>)}</div></div>; }
function GenericOptionChoices({ group, selected, setSelected }: { group: ServiceOptionGroup; selected: string[]; setSelected: (values: string[]) => void }) {
  return <div className="mt-3"><b className="text-[10px]">{group.label}{group.required ? " *" : ""}</b><div className="mt-1 flex flex-wrap gap-1">{group.options.map((item) => { const active = selected.includes(item.value); return <button type="button" key={item.value} onClick={() => setSelected(group.selection === "single" ? [item.value] : active ? selected.filter((value) => value !== item.value) : [...selected, item.value])} className={`rounded border px-2 py-1 text-[9px] ${active ? "border-magenta bg-blush" : ""}`}>{item.label}{item.price_add ? ` +${money(item.price_add)}` : ""}</button>; })}</div></div>;
}
function PromoField(props: Row) { return <div className="mt-3 rounded-lg border border-plum/10 p-3"><b className="text-[10px]">Promo code</b><div className="mt-2 flex gap-2"><input value={props.promoCode} onChange={(event) => { props.setPromoCode(event.target.value.toUpperCase()); props.setPromoDiscount(0); props.setPromoMessage(""); }} placeholder="Enter code" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-[10px] uppercase"/><button type="button" onClick={() => void props.applyPromo()} className="rounded-lg bg-plum px-3 text-[10px] font-bold text-white">Apply</button></div>{props.promoMessage ? <p className={`mt-2 text-[9px] ${props.promoDiscount ? "text-green-700" : "text-red-700"}`}>{props.promoMessage}</p> : null}{props.promoDiscount ? <p className="mt-2 flex justify-between text-[10px]"><span>Deposit after discount</span><b>{money(props.deposit)}</b></p> : null}</div>; }
function StylistPanel({ stylists, value, setValue }: { stylists: Row[]; value: string; setValue: (value: string) => void }) {
  const rows = [{ id: "any", name: "Any available stylist", bio: "The salon will assign the first qualified professional who is free for your complete service time." }, ...stylists];
  return <div className="space-y-3">{rows.map((stylist) => {
    const isAny = stylist.id === "any";
    const specialties = Array.isArray(stylist.specialties) ? stylist.specialties.filter(Boolean) : [];
    const experience = Number(stylist.years_experience || 0);
    const rating = Number(stylist.rating || 0);
    return <button type="button" key={stylist.id} onClick={() => setValue(stylist.id)} className={`flex w-full items-start gap-3 rounded-[12px] border p-3.5 text-left transition ${value === stylist.id ? "border-magenta bg-blush/35 shadow-[0_7px_18px_rgba(214,24,107,0.08)]" : "border-plum/10 bg-white hover:border-magenta/30"}`}>
      <span className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-blush/55 text-plum/55">{isAny ? <UsersRound size={28} strokeWidth={1.5} /> : stylist.avatar_url ? <SafeImage src={stylist.avatar_url} fallbackSrc={stylist.avatar_url} alt={stylist.name || "Stylist"} className="h-full w-full object-cover" /> : <UserRound size={28} strokeWidth={1.5} />}</span>
      <span className="min-w-0 flex-1 py-0.5">
        <span className="flex items-start justify-between gap-2"><b className="block text-[14px] leading-tight text-ink">{stylist.name}</b>{rating > 0 ? <span className="inline-flex items-center gap-1 text-[10px] font-bold"><Star size={11} className="fill-amber text-amber" />{rating.toFixed(1)}</span> : null}</span>
        {experience > 0 ? <span className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-ink/55"><BriefcaseBusiness size={11} className="text-magenta" />{experience} {experience === 1 ? "year" : "years"} experience</span> : null}
        <small className="mt-1.5 block line-clamp-2 text-[10px] leading-4 text-ink/60">{isAny ? stylist.bio : specialties.length ? specialties.join(" · ") : stylist.bio || "Profile details coming soon"}</small>
      </span>
      <input aria-label={`Choose ${stylist.name}`} type="radio" checked={value === stylist.id} readOnly className="mt-1 h-4 w-4 shrink-0 accent-magenta" />
    </button>;
  })}</div>;
}
function DatePanel(props: Row) { const clear=()=>props.setFieldErrors((current:Record<string,string>)=>({...current,date_time:""})); return <div><input type="date" value={props.date} onChange={(event) => {props.setDate(event.target.value);clear();}} className={`w-full rounded-lg border p-3 text-xs ${props.fieldErrors.date_time?"border-red-500":""}`} /><p className="mt-4 flex items-center justify-between text-[10px]"><b>Available Times</b><span><Clock3 size={12} className="inline" /> Est. {props.style?.duration_min_hours || 0} hrs</span></p>{props.availabilityLoading ? <p className="mt-3 text-[10px] text-ink/55">Checking live availability…</p> : <div className="mt-2 grid grid-cols-3 gap-2">{props.slots.map((slot: Slot) => <button key={slot.value} onClick={() => {props.setTime(slot.value);clear();}} className={`rounded-lg border px-1 py-2 text-[9px] ${props.time === slot.value ? "border-magenta bg-blush text-magenta" : ""}`}>{slot.label}</button>)}</div>}{props.fieldErrors.date_time?<p className="mt-2 text-xs font-semibold text-red-700">{props.fieldErrors.date_time}</p>:null}{!props.availabilityLoading && !props.slots.length ? <p className="mt-3 rounded-lg bg-blush/30 p-3 text-[10px]">{props.availabilityReason || "No available times."}</p> : null}{props.suggested ? <button onClick={() => props.applySuggested(props.suggested)} className="mt-3 w-full rounded-lg border border-magenta px-3 py-2 text-[10px] font-bold text-magenta">Next available: {props.suggested.date} at {props.suggested.label}</button> : null}<p className="mt-4 rounded-lg bg-blush/30 p-3 text-[9px] leading-4">Times use the salon’s local timezone and include service duration plus cleanup buffer.</p></div>; }
function ReviewPanel(props: Row) {
  const selected = props.slots.find((slot: Slot) => slot.value === props.time);
  const clear=(key:string)=>props.setFieldErrors((current:Record<string,string>)=>({...current,[key]:""}));
  return <div className="space-y-3 text-[10px]">
    <div className="rounded-lg border p-3"><b>{props.style?.name}</b><p>{props.date} at {selected?.label || "Choose a time"}</p><p>{props.stylists.find((row: Row) => row.id === props.stylistId)?.name || "Any available stylist"}</p></div>
    {props.genericDurationAdjustmentMinutes ? <p className="rounded-lg bg-blush/30 p-2 text-plum">Selected options adjust service time by {props.genericDurationAdjustmentMinutes > 0 ? "+" : ""}{props.genericDurationAdjustmentMinutes} minutes.</p> : null}
    <div className="space-y-1 rounded-lg bg-blush/30 p-3"><p className="flex justify-between"><span>Total Price</span><b>{money(props.total)}</b></p><p className="flex justify-between text-magenta"><span>Reservation Deposit (10%)</span><b>{money(props.deposit)}</b></p><p className="flex justify-between"><span>Balance Due at Salon</span><b>{money(props.balance)}</b></p></div>
    <textarea value={props.clientNotes} onChange={(event) => props.setClientNotes(event.target.value.slice(0, 1000))} rows={3} placeholder="Notes or special requests (allergies, accessibility, service details…)" className="w-full resize-none rounded-lg border p-2" />
    <div><input required value={props.guest.name} onChange={(event) => {props.setGuest((current: Row) => ({ ...current, name: event.target.value }));clear("name");}} placeholder="Full Name" className={`w-full rounded-lg border p-2 ${props.fieldErrors.name?"border-red-500":""}`} />{props.fieldErrors.name?<p className="mt-1 text-xs font-semibold text-red-700">{props.fieldErrors.name}</p>:null}</div>
    <div><input required type="email" pattern={EMAIL_PATTERN} title="Enter a valid email address such as name@example.com" value={props.guest.email} onChange={(event) => {props.setGuest((current: Row) => ({ ...current, email: event.target.value }));clear("email");}} placeholder="name@example.com" className={`w-full rounded-lg border p-2 ${props.fieldErrors.email?"border-red-500":""}`} />{props.fieldErrors.email?<p className="mt-1 text-xs font-semibold text-red-700">{props.fieldErrors.email}</p>:null}</div>
    <div><input required type="tel" inputMode="tel" pattern={US_PHONE_PATTERN} title="A mobile number is required for instant booking and cancellation alerts" value={props.guest.phone} onChange={(event) => {props.setGuest((current: Row) => ({ ...current, phone: formatUsPhoneInput(event.target.value) }));clear("phone");}} placeholder="+1 (555) 123-4567" className={`w-full rounded-lg border p-2 ${props.fieldErrors.phone?"border-red-500":""}`} />{props.fieldErrors.phone?<p className="mt-1 text-xs font-semibold text-red-700">{props.fieldErrors.phone}</p>:null}<p className="mt-1 text-[9px] text-ink/50">Required for immediate appointment alerts by SMS.</p></div>
    <div><label className={`flex gap-2 rounded-lg bg-blush/30 p-2 ${props.fieldErrors.consent?"ring-1 ring-red-500":""}`}><input required type="checkbox" checked={props.consent} onChange={(event) => {props.setConsent(event.target.checked);clear("consent");}} /><span>{Number(props.deposit) > 0 ? "I understand the deposit is a non-refundable reservation fee credited toward my total." : "I confirm the appointment details and agree to the booking terms."}</span></label>{props.fieldErrors.consent?<p className="mt-1 text-xs font-semibold text-red-700">{props.fieldErrors.consent}</p>:null}</div>
  </div>;
}
function PaymentPanel({ confirmed, deposit, saving, reserve, suggested, applySuggested }: Row) { const requiresPayment=Number(deposit)>0; return confirmed ? <div className="rounded-[12px] bg-blush/30 p-5 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-magenta text-white"><Check size={36} /></span><h3 className="mt-4 font-serif text-2xl text-plum">You’re All Set!</h3><p className="mt-2 text-xs">Your appointment is confirmed.</p><div className="mt-4 rounded-lg bg-white p-3"><small>Confirmation Code</small><b className="block text-lg text-plum">{confirmed.confirmation_code}</b></div><Link href="/account" className="mt-4 block text-xs font-bold text-magenta">Go to My Bookings</Link></div> : <div><p className="text-xs font-semibold">{requiresPayment?"Secure Checkout":"Confirm Your Booking"}</p>{requiresPayment?<div className="my-4 flex gap-2 text-[10px]"><span className="rounded border p-2">VISA</span><span className="rounded border p-2">MC</span><span className="rounded border p-2">AMEX</span></div>:<p className="my-4 rounded-lg bg-green-50 p-3 text-xs text-green-800">No payment is required for this booking. Confirming will reserve your appointment immediately.</p>}<p className="rounded-lg bg-blush/30 p-4 text-center"><small>Deposit Amount</small><b className="block text-2xl text-magenta">{money(Number(deposit))}</b></p>{suggested ? <button onClick={() => applySuggested(suggested)} className="mt-4 w-full rounded-lg border border-magenta py-3 text-xs font-bold text-magenta">Use next available: {suggested.date} at {suggested.label}</button> : null}<button onClick={reserve} disabled={saving} className="mt-4 w-full rounded-lg bg-magenta py-3 text-xs font-bold text-white disabled:opacity-60">{saving ? "Reserving…" : requiresPayment?`Pay ${money(Number(deposit))} Deposit`:"Confirm Booking — No Deposit"}</button><p className="mt-3 flex items-center justify-center gap-1 text-[9px] text-ink/50"><LockKeyhole size={11} />{requiresPayment?"Your payment is encrypted and secure.":"Your appointment is protected by our booking safeguards."}</p></div>; }
