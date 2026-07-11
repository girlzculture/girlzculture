/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { salonSupabase as supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

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
  const [hours, setHours] = useState("");

  const [salonId, setSalonId] = useState<string | null>(null);

  // Styles and stylists arrays
  const [styles, setStyles] = useState<any[]>([]);
  const [stylists, setStylists] = useState<any[]>([]);

  // temporary inputs for adding style/stylist
  const [styleName, setStyleName] = useState("");
  const [styleCategory, setStyleCategory] = useState("");
  const [stylePriceMin, setStylePriceMin] = useState("");
  const [stylePriceMax, setStylePriceMax] = useState("");
  const [styleDuration, setStyleDuration] = useState("");
  const [styleLengths, setStyleLengths] = useState("");
  const [styleSizes, setStyleSizes] = useState("");
  const [styleAddons, setStyleAddons] = useState("");

  const [stylistName, setStylistName] = useState("");
  const [stylistSpecialties, setStylistSpecialties] = useState("");
  const [stylistBio, setStylistBio] = useState("");

  const next = () => setStep((s) => Math.min(3, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const saveBasics = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    if (!name || !email) {
      setErrorMessage('Please enter both a business name and contact email.');
      return;
    }
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
      phone,
      email,
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
    if (!styleName) {
      setErrorMessage('Please enter a style name before adding.');
      return;
    }
    setErrorMessage(null);
    setStyles((s) => [
      ...s,
      {
        name: styleName,
        category: styleCategory || 'Braids',
        price_display_min: Number(stylePriceMin || 0),
        price_display_max: Number(stylePriceMax || 0),
        duration_min_hours: Number(styleDuration || 0),
        duration_max_hours: Number(styleDuration || 0),
        length_options: styleLengths ? styleLengths.split(',').map((item) => item.trim()) : [],
        size_options: styleSizes ? styleSizes.split(',').map((item) => item.trim()) : [],
        addons: styleAddons ? styleAddons.split(',').map((item) => item.trim()) : [],
      },
    ]);
    setStyleName("");
    setStyleCategory("");
    setStylePriceMin("");
    setStylePriceMax("");
    setStyleDuration("");
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
    setStylists((s) => [...s, { name: stylistName, specialties: stylistSpecialties.split(',').map((x) => x.trim()).filter(Boolean), bio: stylistBio }]);
    setStylistName("");
    setStylistSpecialties("");
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
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-md border border-ink/10 px-3 py-2" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Contact email" className="rounded-md border border-ink/10 px-3 py-2" />
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
            <label className="block text-sm font-medium text-ink/80">Hours (simple text)</label>
            <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. Mon-Fri 9am-6pm" className="w-full rounded-md border border-ink/10 px-3 py-2" />
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
              <input value={styleName} onChange={(e) => setStyleName(e.target.value)} placeholder="Style name" className="rounded-md border border-ink/10 px-3 py-2" />
              <input value={styleCategory} onChange={(e) => setStyleCategory(e.target.value)} placeholder="Category" className="rounded-md border border-ink/10 px-3 py-2" />
              <input value={styleDuration} onChange={(e) => setStyleDuration(e.target.value)} placeholder="Duration (hours)" className="rounded-md border border-ink/10 px-3 py-2" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 mt-2">
              <input value={stylePriceMin} onChange={(e) => setStylePriceMin(e.target.value)} placeholder="Min price" className="rounded-md border border-ink/10 px-3 py-2" />
              <input value={stylePriceMax} onChange={(e) => setStylePriceMax(e.target.value)} placeholder="Max price" className="rounded-md border border-ink/10 px-3 py-2" />
              <input value={styleLengths} onChange={(e) => setStyleLengths(e.target.value)} placeholder="Length options" className="rounded-md border border-ink/10 px-3 py-2" />
            </div>
            <div className="mt-2">
              <input value={styleSizes} onChange={(e) => setStyleSizes(e.target.value)} placeholder="Size options" className="mb-2 w-full rounded-md border border-ink/10 px-3 py-2" />
              <input value={styleAddons} onChange={(e) => setStyleAddons(e.target.value)} placeholder="Add-ons" className="w-full rounded-md border border-ink/10 px-3 py-2" />
            </div>
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
            <input value={stylistSpecialties} onChange={(e) => setStylistSpecialties(e.target.value)} placeholder="Specialties (comma separated)" className="mb-2 w-full rounded-md border border-ink/10 px-3 py-2" />
            <textarea value={stylistBio} onChange={(e) => setStylistBio(e.target.value)} placeholder="Bio" className="w-full rounded-md border border-ink/10 px-3 py-2" />
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
