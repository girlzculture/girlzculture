import type { BusinessSignupContent } from "./businessSignupContent";
import { isValidEmail, normalizeEmail, normalizeUsPhone, US_PHONE_PATTERN } from "./validation";

export class BusinessWaitlistValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessWaitlistValidationError";
  }
}

function requiredText(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "string") throw new BusinessWaitlistValidationError(`Enter your ${label}.`);
  const text = value.trim();
  if (text.length < minimum || text.length > maximum || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new BusinessWaitlistValidationError(`Enter a valid ${label} (${minimum}–${maximum} characters).`);
  }
  return text;
}

/** The same contact rules are enforced before sending and before persistence. */
export function validateBusinessWaitlistContact(body: Record<string, unknown>) {
  const name = requiredText(body.businessName, "business name", 2, 120);
  const address = requiredText(body.businessAddress, "business address", 5, 500);
  const rawPhone = requiredText(body.businessPhone, "business phone number", 10, 40);
  if (!new RegExp(US_PHONE_PATTERN).test(rawPhone)) {
    throw new BusinessWaitlistValidationError("Enter a valid US business phone number.");
  }
  const phone = normalizeUsPhone(rawPhone);
  const rawEmail = requiredText(body.businessEmail, "business email", 3, 254);
  if (!isValidEmail(rawEmail)) throw new BusinessWaitlistValidationError("Enter a valid business email address.");
  return { name, address, phone, email: normalizeEmail(rawEmail) };
}

/** Resolve the stable ID from current published content; never trust a client title or mode. */
export function validateBusinessWaitlistSubmission(body: Record<string, unknown>, content: BusinessSignupContent | null) {
  const category = content?.categories.find(item => item.id === body.categoryId);
  if (!category || !category.visible || category.mode !== "waitlist") {
    throw new BusinessWaitlistValidationError("This business type is not accepting waitlist requests. Please choose another business type.");
  }
  const contact = validateBusinessWaitlistContact(body);
  return {
    name: contact.name,
    email: contact.email,
    category: "Partnerships",
    subject: `Business waitlist — ${category.name}`,
    message: [
      `Business type: ${category.name}`,
      `Business category ID: ${category.id}`,
      `Business name: ${contact.name}`,
      `Business address: ${contact.address}`,
      `Business phone number: ${contact.phone}`,
      `Business email: ${contact.email}`,
      "Please email me when onboarding opens for this business type in my area.",
    ].join("\n"),
  };
}

export function isConfirmedBusinessWaitlistTicketId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
