import { BUSINESS_CATEGORIES } from "./businessCategories";
import { businessOnboardingHref } from "./businessOnboarding";

export const BUSINESS_SIGNUP_CONTENT_SLUG = "business-signup";
export const BUSINESS_SIGNUP_CONTENT_LABEL = "business_signup";
export const BUSINESS_SIGNUP_TRUST_ICONS = ["gem", "shield-check", "lock-keyhole", "users-round", "heart", "sparkles"] as const;
export const BUSINESS_SIGNUP_TRUST_IDS = ["built-for-you", "safe-secure", "community"] as const;
const MAX_CONFIG_LENGTH = 64_000;

export type BusinessSignupImage = {
  src: string;
  alt: string;
  fit: "cover" | "contain";
  focalX: number;
  focalY: number;
};
export type BusinessSignupCategoryId = (typeof BUSINESS_CATEGORIES)[number]["slug"];
export type BusinessSignupCategory = {
  id: BusinessSignupCategoryId;
  name: string;
  image: BusinessSignupImage;
  visible: boolean;
  order: number;
  mode: "waitlist" | "live_application";
  waitlist?: { heading?: string; description?: string; image?: BusinessSignupImage };
};
export type BusinessSignupTrust = {
  id: (typeof BUSINESS_SIGNUP_TRUST_IDS)[number];
  icon: (typeof BUSINESS_SIGNUP_TRUST_ICONS)[number];
  heading: string;
  description: string;
  visible: boolean;
  order: number;
};
export type BusinessSignupContent = {
  version: 1;
  header: {
    logo: {
      mode: "text" | "image";
      text: string;
      image: BusinessSignupImage;
      visible: boolean;
      size: "small" | "standard" | "large";
      alignment: "left" | "center";
    };
    login: { helperText: string; label: string; href: string; visible: boolean };
  };
  hero: {
    heading: string;
    supportingText: string;
    visible: boolean;
    accent: "none" | "teal";
    overlay: "light" | "medium" | "strong";
    height: "compact" | "standard" | "tall";
    alignment: "left" | "center";
    media: BusinessSignupImage & { type: "image" | "gif" | "video" | "none"; poster: BusinessSignupImage };
  };
  selector: { heading: string; supportingText: string };
  categories: BusinessSignupCategory[];
  waitlist: {
    eyebrow: string;
    heading: string;
    description: string;
    submitLabel: string;
    successHeading: string;
    successDescription: string;
    privacyText: string;
    supportText: string;
  };
  trust: BusinessSignupTrust[];
};

// Only implemented application flows belong here. A future category must have
// its own registered application before an administrator can publish live mode.
export const BUSINESS_SIGNUP_LIVE_APPLICATIONS: Readonly<Partial<Record<BusinessSignupCategoryId, string>>> = {
  "hair-salon-braiding": "/business/signup/hair",
};

const image = (src = "", alt = ""): BusinessSignupImage => ({ src, alt, fit: "cover", focalX: 50, focalY: 50 });
const categoryAssets = {
  hair: "hair", nails: "nails", massage: "massage", facial: "facial",
  tattoo: "tattoo", lashes: "lashes", barber: "barber", other: "other",
};

export const DEFAULT_BUSINESS_SIGNUP_CONTENT: BusinessSignupContent = {
  version: 1,
  header: {
    logo: { mode: "text", text: "Girlz Culture", image: image(), visible: true, size: "standard", alignment: "left" },
    login: { helperText: "Already have an account?", label: "Log In", href: "/business/login", visible: true },
  },
  hero: {
    heading: "Grow Your Beauty Business",
    supportingText: "Get discovered by more clients, manage your business all in one place, and be part of a supportive community built for beauty entrepreneurs.",
    visible: true, accent: "teal", overlay: "medium", height: "standard", alignment: "left",
    media: { ...image("/images/business/business-signup-hero.avif"), type: "image", poster: image("/images/business/business-signup-hero.avif") },
  },
  selector: { heading: "What’s Your Business?", supportingText: "Select the category that best fits your business." },
  categories: BUSINESS_CATEGORIES.map((category, order) => ({
    id: category.slug, name: category.name,
    image: image(`/images/business/${categoryAssets[category.photo]}-service.avif`),
    visible: true, order, mode: category.live ? "live_application" : "waitlist",
  })),
  waitlist: {
    eyebrow: "EARLY ACCESS",
    heading: "Join the {businessType} Waitlist",
    description: "We’re opening access to more beauty and wellness businesses in stages. Join the waitlist and we’ll reach out when onboarding opens for {businessType} businesses in your area.",
    submitLabel: "Join the Waitlist",
    successHeading: "You’re on the waitlist",
    successDescription: "We’ve received your interest in {businessType}. We’ll email you when this category opens in your area.",
    privacyText: "Join to receive an email when this category opens.",
    supportText: "",
  },
  trust: [
    { id: "built-for-you", icon: "gem", heading: "A Platform Built for You", description: "Designed for beauty and wellness businesses like yours.", visible: true, order: 0 },
    { id: "safe-secure", icon: "lock-keyhole", heading: "Safe & Secure", description: "Your data and business information are always protected.", visible: true, order: 1 },
    { id: "community", icon: "heart", heading: "More Than a Platform", description: "Join a growing community of entrepreneurs, creators, and professionals.", visible: true, order: 2 },
  ],
};

export class BusinessSignupContentValidationError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "BusinessSignupContentValidationError";
  }
}

function invalid(path: string, message: string): never {
  throw new BusinessSignupContentValidationError(path, message);
}

function record(value: unknown, path: string, allowedKeys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(path, "Choose a valid content object.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !allowedKeys.includes(key))) invalid(path, "Unsupported content fields are not allowed.");
  return row;
}

function text(value: unknown, path: string, maximum: number) {
  if (typeof value !== "string") invalid(path, "Enter plain text.");
  const result = value.trim();
  if (result.length > maximum) invalid(path, `Use ${maximum} characters or fewer.`);
  if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) invalid(path, "HTML and control characters are not allowed.");
  return result;
}

function choice<const T extends readonly string[]>(value: unknown, path: string, choices: T): T[number] {
  if (typeof value !== "string" || !choices.includes(value)) invalid(path, "Choose a supported option.");
  return value as T[number];
}

function bool(value: unknown, path: string) {
  if (typeof value !== "boolean") invalid(path, "Choose visible or hidden.");
  return value;
}

function number(value: unknown, path: string, maximum: number, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum || (integer && !Number.isInteger(value))) {
    invalid(path, `Use ${integer ? "a whole number" : "a number"} from 0 to ${maximum}.`);
  }
  return value;
}

/** Safe same-site paths only; encoded slashes/backslashes cannot change origin. */
export function safeBusinessSignupInternalHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1_200 || value !== value.trim()) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (!value.startsWith("/") || value.startsWith("//") || !decoded.startsWith("/") || decoded.startsWith("//")) return null;
    if (/[\\\u0000-\u0020\u007f<>]/.test(value) || /[\\\u0000-\u001f\u007f<>]/.test(decoded)) return null;
    const parsed = new URL(value, "https://girlzculture.invalid");
    return parsed.origin === "https://girlzculture.invalid" ? value : null;
  } catch { return null; }
}

function mediaUrl(value: unknown, path: string) {
  const url = text(value, path, 1_200);
  if (url === "") return "";
  if (safeBusinessSignupInternalHref(url)) {
    const pathname = new URL(url, "https://girlzculture.invalid").pathname;
    if (pathname.startsWith("/images/") || pathname.startsWith("/videos/")) return url;
  }
  try {
    const parsed = new URL(url);
    const storage = new URL((process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/i, ""));
    const localFixture = process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS === "true"
      && storage.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(storage.hostname);
    if ((parsed.protocol === "https:" || localFixture) && parsed.origin === storage.origin
      && parsed.pathname.startsWith("/storage/v1/object/public/content-media/")
      && !parsed.username && !parsed.password && !/[\\\u0000-\u0020\u007f]/.test(url)) return url;
  } catch { /* Report a user-safe validation failure below. */ }
  return invalid(path, "Use a local image/video path or media uploaded to this site.");
}

function parseImage(value: unknown, path: string): BusinessSignupImage {
  const row = record(value, path, ["src", "alt", "fit", "focalX", "focalY"]);
  return {
    src: mediaUrl(row.src, `${path}.src`), alt: text(row.alt, `${path}.alt`, 240),
    fit: choice(row.fit, `${path}.fit`, ["cover", "contain"]),
    focalX: number(row.focalX, `${path}.focalX`, 100), focalY: number(row.focalY, `${path}.focalY`, 100),
  };
}

function parseCategory(value: unknown, index: number): BusinessSignupCategory {
  const path = `categories[${index}]`;
  const row = record(value, path, ["id", "name", "image", "visible", "order", "mode", "waitlist"]);
  let waitlist: BusinessSignupCategory["waitlist"];
  if (row.waitlist !== undefined) {
    const overrides = record(row.waitlist, `${path}.waitlist`, ["heading", "description", "image"]);
    waitlist = {
      ...(overrides.heading !== undefined ? { heading: text(overrides.heading, `${path}.waitlist.heading`, 160) } : {}),
      ...(overrides.description !== undefined ? { description: text(overrides.description, `${path}.waitlist.description`, 1_200) } : {}),
      ...(overrides.image !== undefined ? { image: parseImage(overrides.image, `${path}.waitlist.image`) } : {}),
    };
  }
  return {
    id: choice(row.id, `${path}.id`, BUSINESS_CATEGORIES.map(category => category.slug)),
    name: text(row.name, `${path}.name`, 100), image: parseImage(row.image, `${path}.image`),
    visible: bool(row.visible, `${path}.visible`), order: number(row.order, `${path}.order`, 100, true),
    mode: choice(row.mode, `${path}.mode`, ["waitlist", "live_application"]),
    ...(waitlist !== undefined ? { waitlist } : {}),
  };
}

/** Strict complete-document validation for admin writes; no CSS/HTML passthrough. */
export function validateBusinessSignupContent(value: unknown, options: { forPublication?: boolean } = {}): BusinessSignupContent {
  const root = record(value, "businessSignup", ["version", "header", "hero", "selector", "categories", "waitlist", "trust"]);
  if (root.version !== 1) invalid("version", "This content version is not supported.");
  const header = record(root.header, "header", ["logo", "login"]);
  const logo = record(header.logo, "header.logo", ["mode", "text", "image", "visible", "size", "alignment"]);
  const login = record(header.login, "header.login", ["helperText", "label", "href", "visible"]);
  const loginHref = text(login.href, "header.login.href", 1_200);
  if (loginHref !== "" && !safeBusinessSignupInternalHref(login.href)) invalid("header.login.href", "Choose a safe internal destination.");
  const hero = record(root.hero, "hero", ["heading", "supportingText", "visible", "accent", "overlay", "height", "alignment", "media"]);
  const media = record(hero.media, "hero.media", ["type", "src", "alt", "fit", "focalX", "focalY", "poster"]);
  const selector = record(root.selector, "selector", ["heading", "supportingText"]);
  const waitlist = record(root.waitlist, "waitlist", ["eyebrow", "heading", "description", "submitLabel", "successHeading", "successDescription", "privacyText", "supportText"]);
  if (!Array.isArray(root.categories) || root.categories.length !== 8) invalid("categories", "Keep all eight stable category records; use visibility to hide a card.");
  const categories = root.categories.map(parseCategory);
  if (new Set(categories.map(category => category.id)).size !== 8) invalid("categories", "Category identities must be unique.");
  if (!Array.isArray(root.trust) || root.trust.length !== 3) invalid("trust", "Keep all three stable trust records; use visibility to hide a block.");
  const trust = root.trust.map((value, index): BusinessSignupTrust => {
    const path = `trust[${index}]`;
    const block = record(value, path, ["id", "icon", "heading", "description", "visible", "order"]);
    return {
      id: choice(block.id, `${path}.id`, BUSINESS_SIGNUP_TRUST_IDS), icon: choice(block.icon, `${path}.icon`, BUSINESS_SIGNUP_TRUST_ICONS),
      heading: text(block.heading, `${path}.heading`, 120), description: text(block.description, `${path}.description`, 500),
      visible: bool(block.visible, `${path}.visible`), order: number(block.order, `${path}.order`, 100, true),
    };
  });
  if (new Set(trust.map(block => block.id)).size !== 3) invalid("trust", "Trust block identities must be unique.");
  const result: BusinessSignupContent = {
    version: 1,
    header: {
      logo: {
        mode: choice(logo.mode, "header.logo.mode", ["text", "image"]), text: text(logo.text, "header.logo.text", 80),
        image: parseImage(logo.image, "header.logo.image"), visible: bool(logo.visible, "header.logo.visible"),
        size: choice(logo.size, "header.logo.size", ["small", "standard", "large"]),
        alignment: choice(logo.alignment, "header.logo.alignment", ["left", "center"]),
      },
      login: { helperText: text(login.helperText, "header.login.helperText", 160), label: text(login.label, "header.login.label", 60), href: loginHref, visible: bool(login.visible, "header.login.visible") },
    },
    hero: {
      heading: text(hero.heading, "hero.heading", 160), supportingText: text(hero.supportingText, "hero.supportingText", 600),
      visible: bool(hero.visible, "hero.visible"), accent: choice(hero.accent, "hero.accent", ["none", "teal"]),
      overlay: choice(hero.overlay, "hero.overlay", ["light", "medium", "strong"]), height: choice(hero.height, "hero.height", ["compact", "standard", "tall"]),
      alignment: choice(hero.alignment, "hero.alignment", ["left", "center"]),
      media: {
        ...parseImage({ src: media.src, alt: media.alt, fit: media.fit, focalX: media.focalX, focalY: media.focalY }, "hero.media"),
        type: choice(media.type, "hero.media.type", ["image", "gif", "video", "none"]), poster: parseImage(media.poster, "hero.media.poster"),
      },
    },
    selector: { heading: text(selector.heading, "selector.heading", 160), supportingText: text(selector.supportingText, "selector.supportingText", 500) },
    categories,
    waitlist: {
      eyebrow: text(waitlist.eyebrow, "waitlist.eyebrow", 80), heading: text(waitlist.heading, "waitlist.heading", 160),
      description: text(waitlist.description, "waitlist.description", 1_200), submitLabel: text(waitlist.submitLabel, "waitlist.submitLabel", 80),
      successHeading: text(waitlist.successHeading, "waitlist.successHeading", 160), successDescription: text(waitlist.successDescription, "waitlist.successDescription", 1_200),
      privacyText: text(waitlist.privacyText, "waitlist.privacyText", 800), supportText: text(waitlist.supportText, "waitlist.supportText", 800),
    },
    trust,
  };
  if (options.forPublication) {
    if (result.header.logo.visible && !(result.header.logo.mode === "text" ? result.header.logo.text : result.header.logo.image.src)) invalid("header.logo", "The visible logo needs text or an image.");
    if (result.header.logo.visible && result.header.logo.mode === "image" && !result.header.logo.image.alt && !result.header.logo.text) invalid("header.logo.image.alt", "Give the logo an accessible name using alt text or logo text.");
    if (result.header.login.visible && (!result.header.login.label || !result.header.login.href)) invalid("header.login", "The visible login needs a label and internal destination.");
    if (result.hero.visible && !result.hero.heading) invalid("hero.heading", "The visible hero needs a heading.");
    if (result.hero.visible && result.hero.media.type !== "none" && !result.hero.media.src) invalid("hero.media.src", "Choose media or select None.");
    if (result.hero.visible && ["gif", "video"].includes(result.hero.media.type) && (!result.hero.media.poster.src || /\.gif(?:[?#]|$)/i.test(result.hero.media.poster.src))) invalid("hero.media.poster", "Animated media needs a still poster for reduced motion and loading failure.");
    if (!result.selector.heading || !result.waitlist.heading || !result.waitlist.submitLabel || !result.waitlist.successHeading) invalid("copy", "Selector, waitlist, success headings and the submit label are required.");
    for (const category of result.categories) {
      if (category.visible && !category.name) invalid(`categories.${category.id}.name`, "A visible category needs a display name.");
      if (category.mode === "live_application" && !BUSINESS_SIGNUP_LIVE_APPLICATIONS[category.id]) invalid(`categories.${category.id}.mode`, "This category has no registered live application yet. Keep it on the waitlist until that flow is available.");
    }
  }
  if (JSON.stringify(result).length > MAX_CONFIG_LENGTH) invalid("businessSignup", "The content document is too large.");
  return result;
}

/** Existing content_pages.labels stays Record<string, string>; publication snapshots own visibility. */
export function encodeBusinessSignupContent(value: unknown, options: { forPublication?: boolean } = {}) {
  return JSON.stringify(validateBusinessSignupContent(value, options));
}

/** Never turn malformed stored content into executable URLs or unregistered routes. */
export function decodeBusinessSignupContent(labels: unknown): BusinessSignupContent {
  try {
    if (!labels || typeof labels !== "object" || Array.isArray(labels)) throw new Error("Missing labels");
    const serialized = (labels as Record<string, unknown>)[BUSINESS_SIGNUP_CONTENT_LABEL];
    if (typeof serialized !== "string" || serialized.length > MAX_CONFIG_LENGTH) throw new Error("Invalid content document");
    return validateBusinessSignupContent(JSON.parse(serialized), { forPublication: true });
  } catch {
    return structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  }
}

export function visibleBusinessCategories(content: BusinessSignupContent) {
  return content.categories.filter(category => category.visible).sort((left, right) => left.order - right.order || BUSINESS_CATEGORIES.findIndex(category => category.slug === left.id) - BUSINESS_CATEGORIES.findIndex(category => category.slug === right.id));
}

export function businessSignupCategoryHref(category: BusinessSignupCategory, explicitPlan?: unknown): string | null {
  if (!BUSINESS_CATEGORIES.some(item => item.slug === category.id)) return null;
  if (category.mode === "waitlist") return `/business/waitlist?category=${category.id}`;
  if (category.mode !== "live_application") return null;
  const target = BUSINESS_SIGNUP_LIVE_APPLICATIONS[category.id];
  return target ? businessOnboardingHref(target, category.id === "hair-salon-braiding" ? explicitPlan : undefined) : null;
}

export function interpolateBusinessSignupTemplate(template: string, categoryName: string) {
  return template.replaceAll("{businessType}", categoryName).replaceAll("[Business Type]", categoryName);
}
