export const EMAIL_PATTERN = "^[^\\s@]+@[^\\s@]+\\.[A-Za-z]{2,}$";
export const US_PHONE_PATTERN = "^(?:\\+?1[ .-]?)?(?:\\([2-9]\\d{2}\\)|[2-9]\\d{2})[ .-]?\\d{3}[ .-]?\\d{4}$";

export function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: unknown) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email);
}

export function normalizeUsPhone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (!/^[2-9]\d{9}$/.test(digits)) throw new Error("Please enter a US phone number.");
  return `+1${digits}`;
}

export function isValidUsPhone(value: unknown) {
  try { normalizeUsPhone(value); return true; } catch { return false; }
}

export function formatUsPhoneInput(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (!digits) return "";
  if (digits.length < 4) return `+1 (${digits}`;
  if (digits.length < 7) return `+1 (${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
