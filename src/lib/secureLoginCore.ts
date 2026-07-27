export type SecureLoginExpectedFailure = {
  status: 400 | 401 | 403;
  message: string;
};

export function classifyExpectedSecureLoginFailure(
  error: unknown,
): SecureLoginExpectedFailure | null {
  const message = error instanceof Error ? error.message.trim() : "";
  if (
    [
      "Invalid login destination.",
      "Password is required.",
      "Enter the six-digit verification code.",
      "A valid email address is required.",
      "Unable to submit this form.",
    ].includes(message)
  ) {
    return { status: 400, message };
  }
  if (
    message === "Email or password is incorrect." ||
    message === "Verification request is invalid." ||
    message === "This verification code has already been used." ||
    message.startsWith("This verification code has expired.") ||
    message.startsWith("Verification code is incorrect.")
  ) {
    return { status: 401, message };
  }
  if (
    message === "Unable to sign in with that admin account." ||
    message === "This account requires administrator review." ||
    /^This is not a (?:salon-owner|admin|customer) account\.$/.test(message) ||
    message === "Forbidden: use the authorized account portal."
  ) {
    return { status: 403, message };
  }
  return null;
}
