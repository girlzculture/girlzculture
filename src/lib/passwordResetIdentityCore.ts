export type PasswordResetAuthIdentity = {
  phone?: string | null;
  phone_confirmed_at?: string | null;
};

export type SmsResetDestination = {
  eligible: boolean;
  canonicalPhone: string;
};

function canonicalUsPhone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (!/^[2-9]\d{9}$/.test(digits)) {
    throw new Error("Invalid canonical US phone.");
  }
  return `+1${digits}`;
}

/**
 * SMS recovery is an identity-bound delivery channel, not a caller-selected
 * destination. Supabase's canonical auth phone must be present and confirmed;
 * a caller-supplied number is used only as a comparison factor.
 */
export function resolveSmsResetDestination(
  identity: PasswordResetAuthIdentity | null | undefined,
  callerPhone: unknown,
): SmsResetDestination {
  if (!identity?.phone || !identity.phone_confirmed_at) {
    return { eligible: false, canonicalPhone: "" };
  }
  try {
    const canonicalPhone = canonicalUsPhone(identity.phone);
    const comparedPhone = canonicalUsPhone(callerPhone);
    if (comparedPhone !== canonicalPhone) {
      return { eligible: false, canonicalPhone: "" };
    }
    return { eligible: true, canonicalPhone };
  } catch {
    return { eligible: false, canonicalPhone: "" };
  }
}
