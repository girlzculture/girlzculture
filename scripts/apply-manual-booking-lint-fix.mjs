import { readFileSync, writeFileSync } from "node:fs";

function patchFile(path, patches) {
  let source = readFileSync(path, "utf8");
  for (const [before, after] of patches) {
    const first = source.indexOf(before);
    if (first < 0) {
      throw new Error(`Missing expected source in ${path}: ${before.slice(0, 140)}`);
    }
    if (source.indexOf(before, first + before.length) >= 0) {
      throw new Error(`Expected one source match in ${path}: ${before.slice(0, 140)}`);
    }
    source = source.slice(0, first) + after + source.slice(first + before.length);
  }
  writeFileSync(path, source);
}

patchFile("src/components/admin/AdminManualBookingWizard.tsx", [
  [
    `import SafeImage from "@/components/site/SafeImage";\n`,
    ``,
  ],
  [
    `  const selectedSalonName = String(salon?.name || salons.find((row) => String(row.id) === salonId)?.name || "Salon");\n\n  useEffect(() => {`,
    `  const selectedSalonName = String(salon?.name || salons.find((row) => String(row.id) === salonId)?.name || "Salon");\n\n  function changeSalon(nextSalonId: string) {\n    setSalonId(nextSalonId);\n    setSalon(null);\n    setStyles([]);\n    setStylists([]);\n    setStyleId("");\n    setStylistId("");\n    setDate("");\n    setSlots([]);\n    setSlotKey("");\n    setLoadingOptions(false);\n    setLoadingSlots(false);\n    setNotice("");\n  }\n\n  function changeCustomerQuery(nextQuery: string) {\n    setCustomerQuery(nextQuery);\n    setCustomerId("");\n    setCustomers([]);\n  }\n\n  function changeGuestEmail(nextEmail: string) {\n    setGuestEmail(nextEmail);\n    setSlots([]);\n    setSlotKey("");\n    setLoadingSlots(false);\n  }\n\n  function changeDate(nextDate: string) {\n    setDate(nextDate);\n    setSlots([]);\n    setSlotKey("");\n    setLoadingSlots(false);\n  }\n\n  useEffect(() => {`,
  ],
  [
    `  useEffect(() => {\n    if (!salonId) {\n      setSalon(null);\n      setStyles([]);\n      setStylists([]);\n      setStyleId("");\n      setStylistId("");\n      setDate("");\n      setSlots([]);\n      setSlotKey("");\n      return;\n    }\n    let live = true;\n    setLoadingOptions(true);\n    setNotice("");\n    adminHeaders()\n      .then((headers) => fetch(\`/api/admin/bookings?salon_id=\${encodeURIComponent(salonId)}\`, { headers, cache: "no-store" }))\n      .then(async (response) => {\n        const body = await readApiResponse(response, "Unable to load this salon's booking options.");\n        if (!response.ok) throw new Error(String(body.error || "Unable to load booking options."));\n        return body as { salon?: Row; styles?: Row[]; stylists?: Row[] };\n      })\n      .then((body) => {\n        if (!live) return;\n        setSalon(body.salon || null);\n        setStyles(Array.isArray(body.styles) ? body.styles : []);\n        setStylists(Array.isArray(body.stylists) ? body.stylists : []);\n        setStyleId("");\n        setStylistId("");\n        setDate("");\n        setSlots([]);\n        setSlotKey("");\n      })\n      .catch((error) => live && setNotice(error instanceof Error ? error.message : "Unable to load booking options."))\n      .finally(() => live && setLoadingOptions(false));\n    return () => { live = false; };\n  }, [salonId]);`,
    `  useEffect(() => {\n    if (!salonId) return;\n    let live = true;\n    const timer = window.setTimeout(() => {\n      if (!live) return;\n      setLoadingOptions(true);\n      setNotice("");\n      adminHeaders()\n        .then((headers) => fetch(\`/api/admin/bookings?salon_id=\${encodeURIComponent(salonId)}\`, { headers, cache: "no-store" }))\n        .then(async (response) => {\n          const body = await readApiResponse(response, "Unable to load this salon's booking options.");\n          if (!response.ok) throw new Error(String(body.error || "Unable to load booking options."));\n          return body as { salon?: Row; styles?: Row[]; stylists?: Row[] };\n        })\n        .then((body) => {\n          if (!live) return;\n          setSalon(body.salon || null);\n          setStyles(Array.isArray(body.styles) ? body.styles : []);\n          setStylists(Array.isArray(body.stylists) ? body.stylists : []);\n        })\n        .catch((error) => {\n          if (live) setNotice(error instanceof Error ? error.message : "Unable to load booking options.");\n        })\n        .finally(() => {\n          if (live) setLoadingOptions(false);\n        });\n    }, 0);\n    return () => {\n      live = false;\n      window.clearTimeout(timer);\n    };\n  }, [salonId]);`,
  ],
  [
    `  useEffect(() => {\n    const query = customerQuery.trim();\n    if (query.length < 2) {\n      setCustomers([]);\n      return;\n    }`,
    `  useEffect(() => {\n    const query = customerQuery.trim();\n    if (customerId || query.length < 2) return;`,
  ],
  [
    `  }, [customerQuery]);`,
    `  }, [customerId, customerQuery]);`,
  ],
  [
    `  useEffect(() => {\n    if (!salonId || !styleId || !date) {\n      setSlots([]);\n      setSlotKey("");\n      return;\n    }\n    let live = true;\n    setLoadingSlots(true);\n    setNotice("");\n    const params = new URLSearchParams({ salon_id: salonId, style_id: styleId, date });\n    if (guestEmail) params.set("guest_email", guestEmail);\n    adminHeaders()\n      .then((headers) => fetch(\`/api/admin/bookings?\${params}\`, { headers, cache: "no-store" }))\n      .then(async (response) => {\n        const body = await readApiResponse(response, "Unable to load available appointment times.");\n        if (!response.ok) throw new Error(String(body.error || "Unable to load appointment times."));\n        return body as { slots?: Row[] };\n      })\n      .then((body) => {\n        if (!live) return;\n        setSlots(Array.isArray(body.slots) ? body.slots : []);\n        setSlotKey("");\n      })\n      .catch((error) => live && setNotice(error instanceof Error ? error.message : "Unable to load appointment times."))\n      .finally(() => live && setLoadingSlots(false));\n    return () => { live = false; };\n  }, [date, guestEmail, salonId, styleId]);`,
    `  useEffect(() => {\n    if (!salonId || !styleId || !date) return;\n    let live = true;\n    const timer = window.setTimeout(() => {\n      if (!live) return;\n      setLoadingSlots(true);\n      setNotice("");\n      const params = new URLSearchParams({ salon_id: salonId, style_id: styleId, date });\n      if (guestEmail) params.set("guest_email", guestEmail);\n      adminHeaders()\n        .then((headers) => fetch(\`/api/admin/bookings?\${params}\`, { headers, cache: "no-store" }))\n        .then(async (response) => {\n          const body = await readApiResponse(response, "Unable to load available appointment times.");\n          if (!response.ok) throw new Error(String(body.error || "Unable to load appointment times."));\n          return body as { slots?: Row[] };\n        })\n        .then((body) => {\n          if (!live) return;\n          setSlots(Array.isArray(body.slots) ? body.slots : []);\n          setSlotKey("");\n        })\n        .catch((error) => {\n          if (live) setNotice(error instanceof Error ? error.message : "Unable to load appointment times.");\n        })\n        .finally(() => {\n          if (live) setLoadingSlots(false);\n        });\n    }, 0);\n    return () => {\n      live = false;\n      window.clearTimeout(timer);\n    };\n  }, [date, guestEmail, salonId, styleId]);`,
  ],
  [
    `    setCustomerQuery(String(customer.name || customer.email || ""));\n    setCustomers([]);`,
    `    setCustomerQuery(String(customer.name || customer.email || ""));\n    setCustomers([]);\n    setSlots([]);\n    setSlotKey("");\n    setLoadingSlots(false);`,
  ],
  [
    `onChange={(event) => { setCustomerQuery(event.target.value); setCustomerId(""); }}`,
    `onChange={(event) => changeCustomerQuery(event.target.value)}`,
  ],
  [
    `onChange={(event) => setGuestEmail(event.target.value)}`,
    `onChange={(event) => changeGuestEmail(event.target.value)}`,
  ],
  [
    `onChange={(event) => setSalonId(event.target.value)}`,
    `onChange={(event) => changeSalon(event.target.value)}`,
  ],
  [
    `onChange={(event) => { setStyleId(event.target.value); setDate(""); setSlotKey(""); }}`,
    `onChange={(event) => { setStyleId(event.target.value); setDate(""); setSlots([]); setSlotKey(""); setLoadingSlots(false); }}`,
  ],
  [
    `onChange={(event) => setDate(event.target.value)}`,
    `onChange={(event) => changeDate(event.target.value)}`,
  ],
]);

patchFile("src/components/admin/AdminSalonPayoutAction.tsx", [
  [
    `Transferred to the salon's Stripe balance. Stripe controls the connected account's later bank payout timing.`,
    `Transferred to the salon’s Stripe balance. Stripe controls the connected account’s later bank payout timing.`,
  ],
]);

patchFile("src/app/api/admin/bookings/route.ts", [
  [`type Row = Record<string, unknown>;\n`, ``],
]);

console.log("Manual booking and payout lint corrections applied.");
