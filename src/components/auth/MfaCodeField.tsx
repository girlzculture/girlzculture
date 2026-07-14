"use client";

import { ShieldCheck } from "lucide-react";
import type { LoginChallenge } from "@/lib/secureLoginClient";

export default function MfaCodeField({ challenge, code, setCode, reset }: { challenge: LoginChallenge; code: string; setCode: (value: string) => void; reset: () => void }) {
  return <div className="rounded-[12px] border border-magenta/25 bg-blush/25 p-4">
    <p className="flex items-center gap-2 font-semibold text-plum"><ShieldCheck size={18} />Two-factor verification</p>
    <p className="mt-2 text-sm leading-6 text-ink/70">Enter the six-digit code sent by {challenge.channel} to {challenge.destination}. It expires in 10 minutes.</p>
    <label className="mt-4 block text-sm font-semibold">Verification code
      <input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-2 w-full rounded-[9px] border border-plum/20 bg-white px-4 py-3 text-center text-xl tracking-[.35em] outline-none focus:border-magenta" placeholder="000000" />
    </label>
    <button type="button" onClick={reset} className="mt-3 text-sm font-semibold text-magenta">Use a different account or send a new code</button>
  </div>;
}
