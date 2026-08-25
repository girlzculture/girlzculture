"use client";

import { useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { formatZonedDateTime } from "@/lib/dateTime";

export type CheckInExceptionRequirement = {
  exception_kind: "early" | "late";
  scheduled_at: string;
  attempted_at: string;
  offset_minutes: number;
  standard_window: { opens_at: string; closes_at: string };
  reasons: Array<{ value: string; label: string }>;
};

export type CheckInExceptionAnswer = {
  reason_code: string;
  reason_detail: string;
  attested: true;
};

function when(value: string, zone: string) {
  return formatZonedDateTime(value, zone || "America/New_York");
}

export default function BookingCheckInExceptionForm({
  requirement,
  timeZone,
  busy,
  onCancel,
  onSubmit,
}: {
  requirement: CheckInExceptionRequirement;
  timeZone: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (answer: CheckInExceptionAnswer) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState("");
  const title = requirement.exception_kind === "early" ? "Early check-in" : "Late check-in";
  const timing = useMemo(() => {
    const difference = Math.abs(Number(requirement.offset_minutes || 0));
    if (requirement.exception_kind === "early")
      return `${difference} minutes before the scheduled appointment`;
    return `${difference} minutes after the scheduled appointment`;
  }, [requirement.exception_kind, requirement.offset_minutes]);

  return (
    <section className="mt-3 rounded-xl border border-amber/35 bg-amber/10 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-amber-800">
          <Clock3 size={18} />
        </span>
        <div>
          <h4 className="font-serif text-lg text-plum">{title} reason required</h4>
          <p className="mt-1 text-xs leading-5 text-ink/65">
            This appointment is scheduled for <b>{when(requirement.scheduled_at, timeZone)}</b>. You are checking the customer in {timing}.
          </p>
          <p className="mt-1 text-[10px] leading-4 text-ink/50">
            Standard check-in is available from {when(requirement.standard_window.opens_at, timeZone)} through {when(requirement.standard_window.closes_at, timeZone)}.
          </p>
        </div>
      </div>
      <label className="mt-4 block text-[10px] font-bold uppercase tracking-wide text-ink/55">
        Select the reason
        <select
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError("");
          }}
          className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 text-xs font-normal normal-case tracking-normal"
        >
          <option value="">Choose a reason</option>
          {requirement.reasons.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {reason === "other" ? (
        <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-ink/55">
          Short explanation
          <textarea
            value={detail}
            onChange={(event) => {
              setDetail(event.target.value.slice(0, 500));
              setError("");
            }}
            rows={3}
            className="mt-1 w-full rounded-lg border border-plum/15 bg-white p-3 text-xs font-normal normal-case tracking-normal"
            placeholder="Explain why this check-in falls outside the standard window"
          />
        </label>
      ) : null}
      <label className="mt-3 flex items-start gap-2 rounded-lg bg-white p-3 text-[11px] leading-5 text-ink/70">
        <input
          type="checkbox"
          checked={attested}
          onChange={(event) => {
            setAttested(event.target.checked);
            setError("");
          }}
          className="mt-0.5 h-4 w-4 accent-magenta"
        />
        I confirm that the reason and information entered above are accurate.
      </label>
      {error ? <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-lg border border-plum/15 bg-white text-xs font-bold text-plum disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!reason) {
              setError("Choose the reason for this check-in.");
              return;
            }
            if (reason === "other" && !detail.trim()) {
              setError("Add a short explanation for Other.");
              return;
            }
            if (!attested) {
              setError("Confirm that the information is accurate.");
              return;
            }
            void onSubmit({
              reason_code: reason,
              reason_detail: detail.trim(),
              attested: true,
            });
          }}
          className="min-h-11 rounded-lg bg-magenta text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? "Checking in…" : "Confirm check-in"}
        </button>
      </div>
    </section>
  );
}
