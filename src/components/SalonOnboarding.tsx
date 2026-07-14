/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { salonSupabase as supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { EMAIL_PATTERN, formatUsPhoneInput, isValidEmail, isValidUsPhone, normalizeEmail, normalizeUsPhone, US_PHONE_PATTERN } from "@/lib/validation";
import { ADD_ON_OPTIONS, LENGTH_OPTIONS, SIZE_OPTIONS, STORE_TIME_OPTIONS, WEEK_DAYS } from "@/lib/salonPresets";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function SalonOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Business basics
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [hours, setHours] = useState<Record<string, { open: string; close: string; closed: boolean }>>(() => Object.fromEntries(WEEK_DAYS.map((day) => [day, { open: "09:00", close: "17:00", closed: day === "Sun" }])));

  const [salonId, setSalonId] = useState<string | null>(null);

  // Styles and stylists arrays
  const [styles, setStyles] = useState<any[]>([]);
  const [stylists, setStylists] = useState<any[]>([]);

  // temporary inputs for adding style/stylist
  const [masterStyles, setMasterStyles] = useState<any[]>([]);
  const [styleMasterId, setStyleMasterId] = useState("");
  const [stylePriceMin, setStylePriceMin] = useState("");
  const [stylePriceMax, setStylePriceMax] = useState("");
  const [styleDuration, setStyleDuration] = useState("");
  const [styleLengths, setStyleLengths] = useState<string[]>([]);
  const [styleSizes, setStyleSizes] = useState<string[]>([]);
  const [styleAddons, setStyleAddons] = useState<string[]>([]);

  const [stylistName, setStylistName] = useState("");
  const [stylistSpecialties, setStylistSpecialties] = useState<string[]>([]);
  const [stylistBio, setStylistBio] = useState("");

  const next = () => setStep((s) => Math.min(3, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  useEffect(() => {
    let active = true;
    supabase.from("master_styles").select("id,name,category").eq("is_active", true).order("sort_order").order("name").then(({ data, error }) => {
      if (!active) return;
      if (error) setErrorMessage(error.message); else setMasterStyles(data || []);
    });
    return () => { active = false; };
  }, []);

  const saveBasics = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    if (!name || !email) {
      setErrorMessage('Please enter both a business name and contact email.');
      return;
    }
    if (!isValidEmail(email)) { setErrorMessage("Please enter a valid email address (name@example.com)."); return; }
    if (!isValidUsPhone(phone)) { setErrorMessage("Please enter a US phone number."); return; }
    setLoading(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) {
      setLoading(false);
      setErrorMessage('You must be signed in before creating a salon.');
      return;
    }

    const { data: existingSalon, error: existingSalonError } = await supabase
      .from("salons")
      .select("id")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingSalonError) {
      setLoading(false);
      setErrorMessage(existingSalonError.message);
      return;
    }

    if (existingSalon?.id) {
      setLoading(false);
      router.replace("/salon/dashboard");
      router.refresh();
      return;
    }

    const slug = slugify(name || "salon");
    const payload: any = {
      name,
      description,
      phone: normalizeUsPhone(phone),
      email: normalizeEmail(email),
      user_id: userData.user.id,
      address_street: addressStreet,
      address_city: addressCity,
      address_state: addressState,
      address_zip: addressZip,
      neighborhood,
      hours,
      slug,
      status: 'New',
    };

    const { data, error } = await supabase.from('salons').insert(payload).select().maybeSingle();
    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSalonId((data as any)?.id || null);
    setInfoMessage('Salon basics saved successfully.');
    next();
  };

  const addStyleLocal = () => {
    const master = masterStyles.find((item) => item.id === styleMasterId);
    if (!master) {
      setErrorMessage('Please choose a style before adding.');
      return;
    }
    setErrorMessage(null);
    setStyles((s) => [
      ...s,
      {
        master_style_id: master.id,
        name: master.name,
        category: master.category,
        price_display_min: Number(stylePriceMin || 0),
        price_display_max: Number(stylePriceMax || 0),
        duration_min_hours: Number(styleDuration || 0),
        duration_max_hours: Number(styleDuration || 0),
        length_options: styleLengths.map((label) => ({ label, price_add: 0 })),
        size_options: styleSizes.map((label) => ({ label, price_add: 0 })),
        addons: styleAddons.filter((label) => label !== "Other").map((label) => ({ label, price_add: 0 })),
      },
    ]);
    setStyleMasterId("");
    setStylePriceMin("");
    setStylePriceMax("");
    setStyleDuration("");
    setStyleLengths([]); setStyleSizes([]); setStyleAddons([]);
  };

  const saveStyles = async () => {
    if (!salonId) {
      setErrorMessage('Salon not created yet. Please save business basics first.');
      console.error('saveStyles called without salonId');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    const inserts = styles.map((s) => ({ ...s, salon_id: salonId }));
    if (inserts.length) {
      console.log('Inserting styles for salonId', salonId, inserts);
      const { data, error } = await supabase.from('styles').insert(inserts).select();
      setLoading(false);
      if (error) {
        console.error('Supabase styles insert error:', error);
        setErrorMessage(error.message);
        return;
      }
      console.log('Styles saved:', data);
      setInfoMessage('Styles saved successfully.');
    } else {
      setLoading(false);
      setInfoMessage('No styles added yet, but you can continue.');
    }
    next();
  };

  const addStylistLocal = () => {
    if (!stylistName) return;
    setStylists((s) => [...s, { name: stylistName, specialties: stylistSpecialties, bio: stylistBio.slice(0, 250) }]);
    setStylistName("");
    setStylistSpecialties([]);
    setStylistBio("");
  };

  const saveStylists = async () => {
    if (!salonId) {
      setErrorMessage('Salon not created yet. Please save business basics first.');
      console.error('saveStylists called without salonId');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    const inserts = stylists.map((s) => ({ ...s, salon_id: salonId }));
    if (inserts.length) {
      console.log('Inserting stylists for salonId', salonId, inserts);
      const { data, error } = await supabase.from('stylists').insert(inserts).select();
      setLoading(false);
      if (error) {
        console.error('Supabase stylists insert error:', error);
        setErrorMessage(error.message);
        return;
      }
      console.log('Stylists saved:', data);
      setInfoMessage('Stylists saved successfully.');
    } else {
      setLoading(false);
      setInfoMessage('No stylists added yet, but you can still finish.');
    }
    next();
  };

  const finish = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    if (!name) {
      setErrorMessage('Business name is required to generate a live salon page.');
      return;
    }

    if (!salonId) {
      setErrorMessage('Salon record not found. Please save your business profile first.');
      console.error('finish called without salonId');
      return;
    }

    // Verify salon exists and slug is generated
    const { data, error } = await supabase
      .from('salons')
      .select('id, slug')
      .eq('id', salonId)
      .maybeSingle();

    if (error) {
      console.error('Supabase verify salon error:', error);
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    if (!data || !data.slug) {
      setErrorMessage('Salon record cannot be found or slug is missing.');
      console.error('Salon verify returned no data or missing slug', data);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push(`/salon/${data.slug}`);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm font-medium text-ink/80">Step {step} of 3</div>
        <div className="text-sm text-ink/60">{step === 1 ? 'Business basics' : step === 2 ? 'Add styles' : 'Add stylists'}</div>
      </div>
      {errorMessage ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>
      ) : null}
      {infoMessage ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{infoMessage}</div>
      ) : null}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink/80">Business name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-ink/10 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/80">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-ink/10 px-3 py-2" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="tel" inputMode="tel" pattern={US_PHONE_PATTERN} title="Please enter a US phone number" value={phone} onChange={(e) => setPhone(formatUsPhoneInput(e.target.value))} placeholder="+1 (555) 123-4567" className="rounded-md border border-ink/10 px-3 py-2" />
            <input type="email" pattern={EMAIL_PATTERN} title="Enter a valid email address such as name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="rounded-md border border-ink/10 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/80">Address</label>
            <input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="Street" className="mb-2 w-full rounded-md border border-ink/10 px-3 py-2" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="City" className="rounded-md border border-ink/10 px-3 py-2" />
              <input value={addressState} onChange={(e) => setAddressState(e.target.value)} placeholder="State" className="rounded-md border border-ink/10 px-3 py-2" />
              <input value={addressZip} onChange={(e) => setAddressZip(e.target.value)} placeholder="Zip" className="rounded-md border border-ink/10 px-3 py-2" />
            </div>
          </div>
          <div>
            <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Neighborhood (optional)" className="w-full rounded-md border border-ink/10 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/80">Store hours</label>
            <p className="mt-1 text-xs text-ink/55">Choose opening and closing times in 15-minute increments.</p>
            <div className="mt-3 space-y-2">{WEEK_DAYS.map((day) => <div key={day} className="grid grid-cols-[36px_1fr_1fr] gap-2 rounded-lg border border-ink/10 p-2 text-xs"><b>{day}</b><select value={hours[day].open} onChange={(event) => setHours((current) => ({ ...current, [day]: { ...current[day], open: event.target.value } }))} className="min-w-0 rounded-md border border-ink/10 bg-white px-2">{STORE_TIME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select value={hours[day].close} onChange={(event) => setHours((current) => ({ ...current, [day]: { ...current[day], close: event.target.value } }))} className="min-w-0 rounded-md border border-ink/10 bg-white px-2">{STORE_TIME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><label className="col-span-3 flex justify-end gap-2"><input type="checkbox" checked={hours[day].closed} onChange={(event) => setHours((current) => ({ ...current, [day]: { ...current[day], closed: event.target.checked } }))} className="accent-magenta" />Closed</label></div>)}</div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={saveBasics} disabled={loading} className="rounded-full bg-magenta px-4 py-2 text-sm font-semibold text-white">{loading ? 'Saving…' : 'Save & continue'}</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-md border border-ink/10 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select value={styleMasterId} onChange={(e) => setStyleMasterId(e.target.value)} className="rounded-md border border-ink/10 bg-white px-3 py-2"><option value="">Choose style</option>{masterStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select>
              <input value={masterStyles.find((style) => style.id === styleMasterId)?.category || "Category is set automatically"} readOnly className="rounded-md border border-ink/10 bg-blush/20 px-3 py-2 text-ink/55" />
              <input value={styleDuration} onChange={(e) => setStyleDuration(e.target.value)} placeholder="Duration (hours)" className="rounded-md border border-ink/10 px-3 py-2" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 mt-2">
              <input value={stylePriceMin} onChange={(e) => setStylePriceMin(e.target.value)} placeholder="Min price" className="rounded-md border border-ink/10 px-3 py-2" />
              <input value={stylePriceMax} onChange={(e) => setStylePriceMax(e.target.value)} placeholder="Max price" className="rounded-md border border-ink/10 px-3 py-2" />
              <span className="rounded-md border border-ink/10 bg-blush/20 px-3 py-2 text-xs text-ink/60">Select options below</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">{[["Sizes", SIZE_OPTIONS, styleSizes, setStyleSizes], ["Lengths", LENGTH_OPTIONS, styleLengths, setStyleLengths], ["Add-ons", ADD_ON_OPTIONS.filter((item) => item !== "Other"), styleAddons, setStyleAddons]].map(([label, options, values, setter]) => <fieldset key={label as string} className="rounded-lg border border-ink/10 p-3"><legend className="px-1 text-xs font-bold text-plum">{label as string}</legend>{(options as readonly string[]).map((option) => <label key={option} className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={(values as string[]).includes(option)} onChange={() => (setter as React.Dispatch<React.SetStateAction<string[]>>)((current) => current.includes(option) ? current.filter((item) => item !== option) : [...current, option])} className="accent-magenta" />{option}</label>)}</fieldset>)}</div>
            <div className="mt-3 flex gap-2">
              <button onClick={addStyleLocal} className="rounded-full bg-plum px-3 py-1 text-white text-sm">Add style</button>
              <button onClick={saveStyles} className="rounded-full bg-magenta px-3 py-1 text-white text-sm">Save styles</button>
            </div>
          </div>

          <div>
            <div className="mb-2 font-semibold text-plum">Current styles</div>
            <div className="space-y-2">
              {styles.length === 0 ? <div className="text-ink/70">No styles added yet.</div> : styles.map((st, i) => (
                <div key={i} className="rounded-md border border-ink/10 p-2">{st.name} — ${st.price_display_min}–${st.price_display_max} • {st.duration_min_hours} hrs</div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={back} className="rounded-full border border-ink/10 px-4 py-2 text-sm">Back</button>
            <button onClick={saveStyles} className="rounded-full bg-magenta px-4 py-2 text-sm font-semibold text-white">Save & continue</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-md border border-ink/10 p-3">
            <input value={stylistName} onChange={(e) => setStylistName(e.target.value)} placeholder="Stylist name" className="mb-2 w-full rounded-md border border-ink/10 px-3 py-2" />
            <fieldset className="mb-2 grid gap-2 rounded-lg border border-ink/10 p-3 sm:grid-cols-2"><legend className="px-1 text-xs font-bold text-plum">Specialties</legend>{masterStyles.map((style) => <label key={style.id} className="flex gap-2 text-xs"><input type="checkbox" checked={stylistSpecialties.includes(style.name)} onChange={() => setStylistSpecialties((current) => current.includes(style.name) ? current.filter((item) => item !== style.name) : [...current, style.name])} className="accent-magenta" />{style.name}</label>)}</fieldset>
            <label className="block text-xs font-bold">Bio<textarea value={stylistBio} maxLength={250} onChange={(e) => setStylistBio(e.target.value)} placeholder="Bio" className="mt-1 w-full rounded-md border border-ink/10 px-3 py-2 font-normal" /><span className="mt-1 block text-right font-normal text-ink/50">{stylistBio.length}/250</span></label>
            <div className="mt-2 flex gap-2">
              <button onClick={addStylistLocal} className="rounded-full bg-plum px-3 py-1 text-white text-sm">Add stylist</button>
              <button onClick={saveStylists} className="rounded-full bg-magenta px-3 py-1 text-white text-sm">Save stylists</button>
            </div>
          </div>

          <div>
            <div className="mb-2 font-semibold text-plum">Current stylists</div>
            <div className="space-y-2">
              {stylists.length === 0 ? <div className="text-ink/70">No stylists added yet.</div> : stylists.map((st, i) => (
                <div key={i} className="rounded-md border border-ink/10 p-2">{st.name} — {st.specialties?.join(' • ')}</div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={back} className="rounded-full border border-ink/10 px-4 py-2 text-sm">Back</button>
            <button onClick={finish} className="rounded-full bg-magenta px-4 py-2 text-sm font-semibold text-white">Finish and view salon</button>
          </div>
        </div>
      )}
    </div>
  );
}
