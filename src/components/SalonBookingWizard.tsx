"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type SalonRecord = {
  id?: string;
  name?: string | null;
  neighborhood?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  phone?: string | null;
  email?: string | null;
};

type StyleRecord = {
  id?: string;
  name?: string | null;
  category?: string | null;
  price_display_min?: number | null;
  price_display_max?: number | null;
  duration_min_hours?: number | null;
  duration_max_hours?: number | null;
  length_options?: any | null;
  size_options?: any | null;
  addons?: any | null;
};

type StylistRecord = {
  id?: string;
  name?: string | null;
  specialties?: string[] | null;
  bio?: string | null;
};

type OptionItem = {
  label: string;
  value: string;
  price_add: number;
};

function normalizeOptions(raw: any): OptionItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (typeof item === "string") {
        return { label: item, value: item, price_add: 0 };
      }
      return {
        label: item.label || item.name || String(item.value || item),
        value: item.value ?? item.label ?? item.name ?? String(item),
        price_add: typeof item.price_add === "number" ? item.price_add : typeof item.price === "number" ? item.price : 0,
      };
    });
  }

  if (typeof raw === "object") {
    return Object.entries(raw).map(([key, value]) => {
      const item: any = value;
      return {
        label: item?.label ?? item?.name ?? key,
        value: item?.value ?? key,
        price_add: typeof item?.price_add === "number" ? item.price_add : typeof item?.price === "number" ? item.price : 0,
      };
    });
  }

  return [];
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function generateConfirmationCode() {
  return `BC-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;
}

export default function SalonBookingWizard({ salon, styles, stylists }: { salon: SalonRecord; styles: StyleRecord[]; stylists: StylistRecord[] }) {
  const [step, setStep] = useState(1);
  const [selectedStyleId, setSelectedStyleId] = useState(styles[0]?.id ?? "");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedLength, setSelectedLength] = useState("");
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [selectedStylistId, setSelectedStylistId] = useState("any");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedTime, setSelectedTime] = useState("10:00 AM");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationData, setConfirmationData] = useState<any>(null);

  const selectedStyle = useMemo(() => styles.find((style) => style.id === selectedStyleId), [selectedStyleId, styles]);
  const sizeOptions = useMemo(() => normalizeOptions(selectedStyle?.size_options), [selectedStyle]);
  const lengthOptions = useMemo(() => normalizeOptions(selectedStyle?.length_options), [selectedStyle]);
  const addonOptions = useMemo(() => normalizeOptions(selectedStyle?.addons), [selectedStyle]);

  const basePrice = selectedStyle?.price_display_min ?? 0;
  const selectedSizePrice = sizeOptions.find((option) => option.value === selectedSize)?.price_add ?? 0;
  const selectedLengthPrice = lengthOptions.find((option) => option.value === selectedLength)?.price_add ?? 0;
  const selectedAddonsPrice = addonOptions
    .filter((option) => selectedAddons.includes(option.value))
    .reduce((sum, option) => sum + option.price_add, 0);
  const estimatedTotal = basePrice + selectedSizePrice + selectedLengthPrice + selectedAddonsPrice;
  const depositAmount = +(estimatedTotal * 0.1).toFixed(2);
  const balanceDue = +(estimatedTotal - depositAmount).toFixed(2);

  const availableStylists = [{ id: "any", name: "Any available", specialties: ["Any"], bio: "No preference" }, ...stylists];

  const timeSlots = ["10:00 AM", "11:30 AM", "1:00 PM", "2:30 PM", "4:00 PM", "5:30 PM"];

  const appointmentDateTime = useMemo(() => {
    if (!selectedDate || !selectedTime) return null;
    const parsed = new Date(`${selectedDate} ${selectedTime}`);
    return isNaN(parsed.getTime()) ? null : parsed;
  }, [selectedDate, selectedTime]);

  const selectedStylist = availableStylists.find((stylist) => stylist.id === selectedStylistId);

  const canReview = !!selectedStyle && !!selectedDate && !!selectedTime;

  const goNext = () => {
    setError(null);
    if (step === 1) {
      if (!selectedStyle) {
        setError("Please choose a style before continuing.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!appointmentDateTime) {
        setError("Please select a valid date and time.");
        return;
      }
      setStep(4);
      return;
    }
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const toggleAddon = (value: string) => {
    setSelectedAddons((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  };

  const submitBooking = async () => {
    setError(null);
    if (!consent) {
      setError("Please accept the reservation fee consent to confirm your booking.");
      return;
    }
    if (!selectedStyle) {
      setError("A style must be selected.");
      setStep(1);
      return;
    }
    if (!appointmentDateTime) {
      setError("Please select a valid appointment date and time.");
      setStep(3);
      return;
    }
    setSaving(true);

    const confirmation_code = generateConfirmationCode();
    const payload = {
      customer_id: null,
      salon_id: salon.id,
      style_id: selectedStyle.id,
      stylist_id: selectedStylistId === "any" ? null : selectedStylistId,
      selected_size: selectedSize || null,
      selected_length: selectedLength || null,
      selected_addons: selectedAddons.length ? selectedAddons : null,
      appointment_datetime: appointmentDateTime.toISOString(),
      duration_hours: selectedStyle.duration_min_hours ?? 0,
      estimated_total: estimatedTotal,
      deposit_amount: depositAmount,
      balance_due: balanceDue,
      confirmation_code,
      status: "Requested",
      deposit_status: "Unpaid",
    };

    console.log("Saving booking payload:", payload);
    const { data, error } = await supabase.from("bookings").insert(payload).select().maybeSingle();
    if (error) {
      console.error("Supabase bookings insert error:", error);
      setError(error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setConfirmationData({ booking: data, salon, selectedStyle, selectedStylist, appointmentDateTime, estimatedTotal, depositAmount, balanceDue });
    setStep(5);
  };

  if (confirmationData) {
    return (
      <div className="rounded-[24px] border border-plum/10 bg-white/80 p-6 shadow-sm">
        <div className="mb-4 rounded-3xl bg-blush/60 p-6 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-plum">Booking confirmed</div>
          <h2 className="mt-3 font-serif text-3xl font-semibold text-plum">You’re all set</h2>
          <p className="mt-2 text-sm text-ink/80">Your confirmation code is:</p>
          <div className="mt-3 rounded-full bg-white px-4 py-2 text-lg font-semibold text-magenta shadow-sm">{confirmationData.booking.confirmation_code}</div>
        </div>

        <div className="space-y-4 text-sm text-ink/80">
          <div>
            <div className="font-semibold text-plum">Salon</div>
            <div>{salon.name}</div>
            <div>{salon.neighborhood}</div>
          </div>
          <div>
            <div className="font-semibold text-plum">Appointment</div>
            <div>{appointmentDateTime?.toLocaleString()}</div>
          </div>
          <div>
            <div className="font-semibold text-plum">Deposit</div>
            <div>{formatCurrency(depositAmount)} (unpaid)</div>
          </div>
          <div>
            <div className="font-semibold text-plum">Balance due</div>
            <div>{formatCurrency(balanceDue)}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-plum/10 bg-white/80 p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-magenta">Booking</p>
            <h1 className="font-serif text-3xl font-semibold text-plum">Book your appointment</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-ink/70">
            {Array.from({ length: 4 }, (_, idx) => (
              <div
                key={idx}
                className={`rounded-full px-3 py-2 ${step === idx + 1 ? "bg-magenta text-white" : "bg-blush/40 text-ink/70"}`}
              >
                Step {idx + 1}
              </div>
            ))}
          </div>
        </div>

        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        {step === 1 && (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {styles.length === 0 ? (
                <div className="rounded-3xl border border-plum/10 bg-blush/40 p-6 text-center text-ink/80">No styles available for this salon.</div>
              ) : (
                styles.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setSelectedStyleId(style.id || "")}
                    className={`rounded-[24px] border p-5 text-left transition ${selectedStyleId === style.id ? "border-magenta bg-blush/30" : "border-plum/10 bg-white/80 hover:border-plum"}`}
                  >
                    <div className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-ink/60">{style.category || "Style"}</div>
                    <div className="font-serif text-xl font-semibold text-plum">{style.name}</div>
                    <div className="mt-3 text-sm text-ink/80">Duration: {style.duration_min_hours ?? 0}–{style.duration_max_hours ?? 0} hrs</div>
                    <div className="mt-2 text-sm text-ink/80">From {formatCurrency(style.price_display_min ?? 0)}</div>
                  </button>
                ))
              )}
            </div>

            {selectedStyle && (
              <div className="rounded-[24px] border border-plum/10 bg-blush/40 p-5">
                <h2 className="font-serif text-xl font-semibold text-plum">Options for {selectedStyle.name}</h2>
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-3xl border border-plum/10 bg-white p-4">
                    <div className="mb-3 font-semibold text-plum">Size</div>
                    {sizeOptions.length === 0 ? (
                      <div className="text-sm text-ink/70">No size options</div>
                    ) : (
                      sizeOptions.map((option) => (
                        <label key={option.value} className="flex items-center gap-3 rounded-xl border border-ink/10 p-3 text-sm">
                          <input
                            name="size"
                            type="radio"
                            checked={selectedSize === option.value}
                            onChange={() => setSelectedSize(option.value)}
                            className="h-4 w-4 accent-magenta"
                          />
                          <div>
                            <div>{option.label}</div>
                            <div className="text-ink/60">{formatCurrency(option.price_add)}</div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>

                  <div className="rounded-3xl border border-plum/10 bg-white p-4">
                    <div className="mb-3 font-semibold text-plum">Length</div>
                    {lengthOptions.length === 0 ? (
                      <div className="text-sm text-ink/70">No length options</div>
                    ) : (
                      lengthOptions.map((option) => (
                        <label key={option.value} className="flex items-center gap-3 rounded-xl border border-ink/10 p-3 text-sm">
                          <input
                            name="length"
                            type="radio"
                            checked={selectedLength === option.value}
                            onChange={() => setSelectedLength(option.value)}
                            className="h-4 w-4 accent-magenta"
                          />
                          <div>
                            <div>{option.label}</div>
                            <div className="text-ink/60">{formatCurrency(option.price_add)}</div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>

                  <div className="rounded-3xl border border-plum/10 bg-white p-4">
                    <div className="mb-3 font-semibold text-plum">Add-ons</div>
                    {addonOptions.length === 0 ? (
                      <div className="text-sm text-ink/70">No add-ons</div>
                    ) : (
                      addonOptions.map((option) => (
                        <label key={option.value} className="flex items-center gap-3 rounded-xl border border-ink/10 p-3 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedAddons.includes(option.value)}
                            onChange={() => toggleAddon(option.value)}
                            className="h-4 w-4 accent-magenta"
                          />
                          <div>
                            <div>{option.label}</div>
                            <div className="text-ink/60">{formatCurrency(option.price_add)}</div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-6 rounded-3xl border border-plum/10 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-plum">Estimated total</div>
                    <div className="font-semibold text-plum">{formatCurrency(estimatedTotal)}</div>
                  </div>
                  <div className="mt-2 text-sm text-ink/70">Duration: {selectedStyle.duration_min_hours ?? 0}–{selectedStyle.duration_max_hours ?? 0} hrs</div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {availableStylists.map((stylist) => (
                <button
                  key={stylist.id}
                  type="button"
                  onClick={() => setSelectedStylistId(stylist.id || "any")}
                  className={`rounded-[24px] border p-5 text-left transition ${selectedStylistId === stylist.id ? "border-magenta bg-blush/30" : "border-plum/10 bg-white/80 hover:border-plum"}`}
                >
                  <div className="font-serif text-lg font-semibold text-plum">{stylist.name}</div>
                  <div className="mt-2 text-sm text-ink/70">{stylist.specialties?.join(" • ")}</div>
                  <p className="mt-3 text-sm text-ink/80">{stylist.bio}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[24px] border border-plum/10 bg-white/80 p-5">
                <label className="mb-2 block font-semibold text-plum">Select a date</label>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full rounded-full border border-ink/10 px-4 py-3" />
              </div>
              <div className="rounded-[24px] border border-plum/10 bg-white/80 p-5">
                <div className="mb-2 font-semibold text-plum">Choose a time</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedTime(slot)}
                      className={`rounded-full border px-4 py-3 text-sm ${selectedTime === slot ? "border-magenta bg-magenta/10 text-plum" : "border-ink/10 bg-white text-ink/80"}`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="rounded-[24px] border border-plum/10 bg-blush/30 p-5">
              <div className="font-serif text-xl font-semibold text-plum">Review your booking</div>
              <div className="mt-4 space-y-3 text-sm text-ink/80">
                <div><span className="font-semibold">Style:</span> {selectedStyle?.name}</div>
                <div><span className="font-semibold">Size:</span> {selectedSize || "Standard"}</div>
                <div><span className="font-semibold">Length:</span> {selectedLength || "Standard"}</div>
                <div><span className="font-semibold">Add-ons:</span> {selectedAddons.length ? selectedAddons.join(", ") : "None"}</div>
                <div><span className="font-semibold">Stylist:</span> {selectedStylist?.name}</div>
                <div><span className="font-semibold">Date & time:</span> {appointmentDateTime?.toLocaleString()}</div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[24px] border border-plum/10 bg-white/80 p-5">
                <div className="text-sm text-ink/60">Estimated total</div>
                <div className="mt-2 text-xl font-semibold text-plum">{formatCurrency(estimatedTotal)}</div>
              </div>
              <div className="rounded-[24px] border border-plum/10 bg-white/80 p-5">
                <div className="text-sm text-ink/60">Deposit (10%)</div>
                <div className="mt-2 text-xl font-semibold text-plum">{formatCurrency(depositAmount)}</div>
              </div>
              <div className="rounded-[24px] border border-plum/10 bg-white/80 p-5">
                <div className="text-sm text-ink/60">Balance due</div>
                <div className="mt-2 text-xl font-semibold text-plum">{formatCurrency(balanceDue)}</div>
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-[24px] border border-plum/10 bg-white/80 p-4">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-magenta" />
              <span className="text-sm text-ink/80">I understand the 10% is a non-refundable reservation fee to hold my appointment, credited toward my total — not a payment for the service.</span>
            </label>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {step > 1 && step < 5 ? (
            <button type="button" onClick={goBack} className="rounded-full border border-ink/10 px-4 py-2 text-sm">Back</button>
          ) : null}
          {step < 4 ? (
            <button type="button" onClick={goNext} className="rounded-full bg-magenta px-4 py-2 text-sm font-semibold text-white">Continue</button>
          ) : step === 4 ? (
            <button type="button" onClick={submitBooking} disabled={saving} className="rounded-full bg-magenta px-4 py-2 text-sm font-semibold text-white">
              {saving ? "Confirming…" : "Confirm booking"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
