"use client";

import { useEffect, useState } from "react";
import { Clock3, Save } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";

const TIME_ZONES = [
  ["America/New_York", "Eastern Time"],
  ["America/Chicago", "Central Time"],
  ["America/Denver", "Mountain Time"],
  ["America/Phoenix", "Arizona Time"],
  ["America/Los_Angeles", "Pacific Time"],
  ["America/Anchorage", "Alaska Time"],
  ["Pacific/Honolulu", "Hawaii Time"],
] as const;

export default function AdminTimeZonePreference() {
  const [timeZone, setTimeZone] = useState("America/New_York");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);

  async function authorization() {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Your admin session has expired.");
    return { Authorization: `Bearer ${session.access_token}` };
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/admin/preferences/time-zone", {
          headers: await authorization(),
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (active) setTimeZone(String(body.time_zone || "America/New_York"));
      } catch (error) {
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load your timezone.",
          );
        }
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/preferences/time-zone", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await authorization()),
        },
        body: JSON.stringify({ time_zone: timeZone }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setTimeZone(String(body.time_zone));
      setMessage("Timezone preference saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save your timezone.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-plum/10 bg-white p-5">
      <div className="flex gap-3">
        <Clock3 className="text-magenta" />
        <div>
          <h2 className="font-serif text-2xl text-plum">Admin timezone</h2>
          <p className="mt-1 text-sm leading-6 text-ink/60">
            Platform activity and finance records use this display timezone.
            Salon appointments always use the salon&apos;s timezone. Stored
            timestamps remain UTC.
          </p>
        </div>
      </div>
      <label className="mt-4 block max-w-lg text-sm font-semibold">
        Display timezone
        <select
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"
        >
          {TIME_ZONES.map(([value, label]) => (
            <option key={value} value={value}>
              {label} ({value})
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white gc-disabled-control"
      >
        <Save size={14} />
        Save timezone
      </button>
      {message ? (
        <p role="status" className="mt-3 text-xs text-plum">
          {message}
        </p>
      ) : null}
    </section>
  );
}
