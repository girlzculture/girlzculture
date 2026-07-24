"use client";

import { FormEvent, useState } from "react";
import { KeyRound, MailCheck } from "lucide-react";

export default function GuestBookingRecovery() {
  const [challengeId, setChallengeId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        "/api/guest/bookings/recovery/request",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation_code: form.get("confirmation_code"),
            email: form.get("email"),
            phone: form.get("phone"),
          }),
        },
      );
      const body = (await response.json()) as {
        challenge_id?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok || !body.challenge_id) {
        throw new Error(body.error || "Unable to send a code.");
      }
      setChallengeId(body.challenge_id);
      setMessage(body.message || "Check your email or phone for a code.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to send a code.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/guest/bookings/recovery/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: challengeId,
          code: form.get("code"),
        }),
      });
      const body = (await response.json()) as {
        manage_url?: string;
        error?: string;
      };
      if (!response.ok || !body.manage_url) {
        throw new Error(body.error || "Unable to verify code.");
      }
      window.location.assign(body.manage_url);
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Unable to verify code.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-plum/10 bg-white p-6 shadow-sm sm:p-9">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-blush text-magenta">
        {challengeId ? <KeyRound /> : <MailCheck />}
      </div>
      <h1 className="mt-5 text-center font-serif text-4xl text-plum">
        Recover your booking link
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-center text-sm leading-6 text-ink/65">
        Verify a contact method already saved with your booking. For your
        privacy, we do not confirm whether a booking exists until the code is
        verified.
      </p>
      {!challengeId ? (
        <form onSubmit={requestCode} className="mt-7 grid gap-4">
          <label className="text-xs font-bold">
            Confirmation code
            <input
              required
              name="confirmation_code"
              maxLength={60}
              className="mt-2 min-h-12 w-full rounded-xl border border-plum/15 px-4 outline-none focus:border-magenta"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold">
              Booking email
              <input
                name="email"
                type="email"
                className="mt-2 min-h-12 w-full rounded-xl border border-plum/15 px-4 outline-none focus:border-magenta"
              />
            </label>
            <label className="text-xs font-bold">
              Or US phone
              <input
                name="phone"
                type="tel"
                className="mt-2 min-h-12 w-full rounded-xl border border-plum/15 px-4 outline-none focus:border-magenta"
              />
            </label>
          </div>
          <button
            disabled={busy}
            className="min-h-12 rounded-xl bg-magenta font-bold text-white disabled:opacity-50"
          >
            Send secure code
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="mt-7 grid gap-4">
          <p className="rounded-xl bg-blush/55 p-4 text-sm text-plum">
            {message}
          </p>
          <label className="text-xs font-bold">
            Six-digit code
            <input
              required
              name="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              className="mt-2 min-h-12 w-full rounded-xl border border-plum/15 px-4 text-center text-xl tracking-[.3em] outline-none focus:border-magenta"
            />
          </label>
          <button
            disabled={busy}
            className="min-h-12 rounded-xl bg-magenta font-bold text-white disabled:opacity-50"
          >
            Verify and open booking
          </button>
          <button
            type="button"
            onClick={() => {
              setChallengeId("");
              setMessage("");
            }}
            className="font-bold text-magenta"
          >
            Request another code
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-4 text-center text-sm font-bold text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
