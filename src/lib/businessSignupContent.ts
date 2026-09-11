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
export type BusinessSignupMedia = BusinessSignupImage & { type: "image" | "gif" | "video" | "none"; poster: BusinessSignupImage };
export type BusinessSignupHeroText = { id: string; enabled: boolean; order: number; text: string };
export const BUSINESS_SIGNUP_SECTION_TYPES = ["text", "image_text", "features", "stats", "quote", "cta", "faq", "gallery", "media"] as const;
export type BusinessSignupSectionType = (typeof BUSINESS_SIGNUP_SECTION_TYPES)[number];
export type BusinessSignupSectionPlacement = "after_hero" | "after_selector";
export type BusinessSignupCta = { label: string; href: string };
type BusinessSignupSectionBase = {
  id: string; enabled: boolean; order: number; placement: BusinessSignupSectionPlacement;
  heading: string; subheading: string; body: string; cta?: BusinessSignupCta;
};
export type BusinessSignupSection = BusinessSignupSectionBase & (
  | { type: "text"; variant: "default" | "centered" }
  | { type: "image_text"; variant: "left" | "right" | "stacked" | "wide"; image: BusinessSignupImage }
  | { type: "features"; variant: "grid" | "strip"; items: { id: string; icon: (typeof BUSINESS_SIGNUP_TRUST_ICONS)[number]; heading: string; body: string }[] }
  | { type: "stats"; variant: "grid" | "strip"; items: { id: string; value: string; label: string }[] }
  | { type: "quote"; variant: "card" | "centered"; author?: string; role?: string; image?: BusinessSignupImage }
  | { type: "cta"; variant: "centered" | "split" }
  | { type: "faq"; variant: "accordion" | "list"; items: { id: string; question: string; answer: string }[] }
  | { type: "gallery"; variant: "grid" | "strip"; items: { id: string; image: BusinessSignupImage }[] }
  | { type: "media"; variant: "wide" | "contained"; media: BusinessSignupMedia }
);
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
  version: 1 | 2;
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
    media: BusinessSignupMedia;
    textBlocks?: BusinessSignupHeroText[];
  };
  selector: { heading: string; supportingText: string; visible?: boolean };
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
  sections?: BusinessSignupSection[];
};
export type BusinessSignupContentV2 = Omit<BusinessSignupContent, "version" | "hero" | "selector" | "sections"> & {
  version: 2;
  hero: BusinessSignupContent["hero"] & { textBlocks: BusinessSignupHeroText[] };
  selector: BusinessSignupContent["selector"] & { visible: boolean };
  sections: BusinessSignupSection[];
};

/** In-memory adapter; no seed rewrite or persisted publication change. */
export function upgradeBusinessSignupContent(content: BusinessSignupContent): BusinessSignupContentV2 {
  const copy = structuredClone(content);
  return { ...copy, version: 2, hero: { ...copy.hero, textBlocks: copy.hero.textBlocks ?? [] }, selector: { ...copy.selector, visible: copy.selector.visible ?? true }, sections: copy.sections ?? [] };
}

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

function parseMedia(value: unknown, path: string): BusinessSignupMedia {
  const row = record(value, path, ["type", "src", "alt", "fit", "focalX", "focalY", "poster"]);
  return {
    ...parseImage({ src: row.src, alt: row.alt, fit: row.fit, focalX: row.focalX, focalY: row.focalY }, path),
    type: choice(row.type, `${path}.type`, ["image", "gif", "video", "none"]),
    poster: parseImage(row.poster, `${path}.poster`),
  };
}

function stableId(value: unknown, path: string) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) invalid(path, "Use a stable lowercase identifier of up to 64 letters, numbers and hyphens, starting with a letter.");
  return value;
}

function boundedItems<T extends { id: string }>(value: unknown, path: string, maximum: number, parse: (value: unknown, path: string) => T): T[] {
  if (!Array.isArray(value) || value.length > maximum) invalid(path, `Use a list of at most ${maximum} items.`);
  const items = value.map((item, index) => parse(item, `${path}[${index}]`));
  if (new Set(items.map(item => item.id)).size !== items.length) invalid(path, "Item identities must be unique.");
  return items;
}

function parseHeroText(value: unknown, path: string): BusinessSignupHeroText {
  const row = record(value, path, ["id", "enabled", "order", "text"]);
  return { id: stableId(row.id, `${path}.id`), enabled: bool(row.enabled, `${path}.enabled`), order: number(row.order, `${path}.order`, 1_000, true), text: text(row.text, `${path}.text`, 600) };
}

function parseCta(value: unknown, path: string): BusinessSignupCta {
  const row = record(value, path, ["label", "href"]);
  const href = text(row.href, `${path}.href`, 1_200);
  if (href !== "" && !safeBusinessSignupInternalHref(row.href)) invalid(`${path}.href`, "Choose a safe internal destination.");
  return { label: text(row.label, `${path}.label`, 80), href };
}

function parseSection(value: unknown, path: string): BusinessSignupSection {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(path, "Choose a supported content section.");
  const type = choice((value as Record<string, unknown>).type, `${path}.type`, BUSINESS_SIGNUP_SECTION_TYPES);
  const extraKeys: Record<BusinessSignupSectionType, string[]> = {
    text: [], image_text: ["image"], features: ["items"], stats: ["items"], quote: ["author", "role", "image"], cta: [], faq: ["items"], gallery: ["items"], media: ["media"],
  };
  const row = record(value, path, ["id", "type", "enabled", "order", "placement", "heading", "subheading", "body", "cta", "variant", ...extraKeys[type]]);
  const base: BusinessSignupSectionBase = {
    id: stableId(row.id, `${path}.id`), enabled: bool(row.enabled, `${path}.enabled`), order: number(row.order, `${path}.order`, 1_000, true),
    placement: choice(row.placement, `${path}.placement`, ["after_hero", "after_selector"]),
    heading: text(row.heading, `${path}.heading`, 160), subheading: text(row.subheading, `${path}.subheading`, 600), body: text(row.body, `${path}.body`, 4_000),
    ...(row.cta !== undefined ? { cta: parseCta(row.cta, `${path}.cta`) } : {}),
  };
  switch (type) {
    case "text": return { ...base, type, variant: choice(row.variant, `${path}.variant`, ["default", "centered"]) };
    case "image_text": return { ...base, type, variant: choice(row.variant, `${path}.variant`, ["left", "right", "stacked", "wide"]), image: parseImage(row.image, `${path}.image`) };
    case "features": return { ...base, type, variant: choice(row.variant, `${path}.variant`, ["grid", "strip"]), items: boundedItems(row.items, `${path}.items`, 12, (value, path) => {
      const item = record(value, path, ["id", "icon", "heading", "body"]);
      return { id: stableId(item.id, `${path}.id`), icon: choice(item.icon, `${path}.icon`, BUSINESS_SIGNUP_TRUST_ICONS), heading: text(item.heading, `${path}.heading`, 120), body: text(item.body, `${path}.body`, 800) };
    }) };
    case "stats": return { ...base, type, variant: choice(row.variant, `${path}.variant`, ["grid", "strip"]), items: boundedItems(row.items, `${path}.items`, 12, (value, path) => {
      const item = record(value, path, ["id", "value", "label"]);
      return { id: stableId(item.id, `${path}.id`), value: text(item.value, `${path}.value`, 60), label: text(item.label, `${path}.label`, 160) };
    }) };
    case "quote": return { ...base, type, variant: choice(row.variant, `${path}.variant`, ["card", "centered"]),
      ...(row.author !== undefined ? { author: text(row.author, `${path}.author`, 120) } : {}),
      ...(row.role !== undefined ? { role: text(row.role, `${path}.role`, 160) } : {}),
      ...(row.image !== undefined ? { image: parseImage(row.image, `${path}.image`) } : {}),
    };
    case "cta": return { ...base, type, variant: choice(row.variant, `${path}.variant`, ["centered", "split"]) };
    case "faq": return { ...base, type, variant: choice(row.variant, `${path}.variant`, ["accordion", "list"]), items: boundedItems(row.items, `${path}.items`, 12, (value, path) => {
      const item = record(value, path, ["id", "question", "answer"]);
      return { id: stableId(item.id, `${path}.id`), question: text(item.question, `${path}.question`, 240), answer: text(item.answer, `${path}.answer`, 2_000) };
    }) };
    case "gallery": return { ...base, type, variant: choice(row.variant, `${path}.variant`, ["grid", "strip"]), items: boundedItems(row.items, `${path}.items`, 12, (value, path) => {
      const item = record(value, path, ["id", "image"]);
      return { id: stableId(item.id, `${path}.id`), image: parseImage(item.image, `${path}.image`) };
    }) };
    case "media": return { ...base, type, variant: choice(row.variant, `${path}.variant`, ["wide", "contained"]), media: parseMedia(row.media, `${path}.media`) };
  }
}

function validateActiveMedia(media: BusinessSignupMedia, path: string) {
  if (media.type !== "none" && !media.src) invalid(`${path}.src`, "Choose media or select None.");
  if (["gif", "video"].includes(media.type) && (!media.poster.src || /\.gif(?:[?#]|$)/i.test(media.poster.src))) invalid(`${path}.poster`, "Animated media needs a still poster for reduced motion and loading failure.");
}

function validateActiveSection(section: BusinessSignupSection) {
  if (!section.enabled) return;
  const path = `sections.${section.id}`;
  if (section.cta && (!section.cta.label || !section.cta.href)) invalid(`${path}.cta`, "A visible action needs both a label and a safe internal destination; remove the action to omit it.");
  if ((section.type === "text" || section.type === "cta") && !section.heading && !section.body) invalid(path, "A visible text section needs a heading or body.");
  if (section.type === "cta" && !section.cta) invalid(`${path}.cta`, "Choose a labelled internal action for the CTA section.");
  if (section.type === "image_text" && !section.image.src) invalid(`${path}.image.src`, "Choose an image for the visible image section.");
  if (section.type === "quote" && !section.body) invalid(`${path}.body`, "Enter the visible quotation.");
  if ("items" in section && !section.items.length) invalid(`${path}.items`, "Add an item or disable the section.");
  if (section.type === "features") for (const item of section.items) if (!item.heading) invalid(`${path}.items.${item.id}.heading`, "A visible feature needs a heading.");
  if (section.type === "stats") for (const item of section.items) if (!item.value || !item.label) invalid(`${path}.items.${item.id}`, "A visible statistic needs a value and label.");
  if (section.type === "faq") for (const item of section.items) if (!item.question || !item.answer) invalid(`${path}.items.${item.id}`, "A visible FAQ needs a question and answer.");
  if (section.type === "gallery") for (const item of section.items) if (!item.image.src) invalid(`${path}.items.${item.id}.image.src`, "Choose an image for every visible gallery item.");
  if (section.type === "media") validateActiveMedia(section.media, `${path}.media`);
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
  const root = record(value, "businessSignup", ["version", "header", "hero", "selector", "categories", "waitlist", "trust", "sections"]);
  if (root.version !== 1 && root.version !== 2) invalid("version", "This content version is not supported.");
  if (root.version === 1 && root.sections !== undefined) invalid("sections", "Upgrade to content version 2 before adding sections.");
  const header = record(root.header, "header", ["logo", "login"]);
  const logo = record(header.logo, "header.logo", ["mode", "text", "image", "visible", "size", "alignment"]);
  const login = record(header.login, "header.login", ["helperText", "label", "href", "visible"]);
  const loginHref = text(login.href, "header.login.href", 1_200);
  if (loginHref !== "" && !safeBusinessSignupInternalHref(login.href)) invalid("header.login.href", "Choose a safe internal destination.");
  const hero = record(root.hero, "hero", ["heading", "supportingText", "visible", "accent", "overlay", "height", "alignment", "media", ...(root.version === 2 ? ["textBlocks"] : [])]);
  const selector = record(root.selector, "selector", ["heading", "supportingText", ...(root.version === 2 ? ["visible"] : [])]);
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
    version: root.version,
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
      media: parseMedia(hero.media, "hero.media"),
      ...(root.version === 2 ? { textBlocks: boundedItems(hero.textBlocks, "hero.textBlocks", 8, parseHeroText) } : {}),
    },
    selector: { heading: text(selector.heading, "selector.heading", 160), supportingText: text(selector.supportingText, "selector.supportingText", 500), ...(root.version === 2 ? { visible: bool(selector.visible, "selector.visible") } : {}) },
    categories,
    waitlist: {
      eyebrow: text(waitlist.eyebrow, "waitlist.eyebrow", 80), heading: text(waitlist.heading, "waitlist.heading", 160),
      description: text(waitlist.description, "waitlist.description", 1_200), submitLabel: text(waitlist.submitLabel, "waitlist.submitLabel", 80),
      successHeading: text(waitlist.successHeading, "waitlist.successHeading", 160), successDescription: text(waitlist.successDescription, "waitlist.successDescription", 1_200),
      privacyText: text(waitlist.privacyText, "waitlist.privacyText", 800), supportText: text(waitlist.supportText, "waitlist.supportText", 800),
    },
    trust,
    ...(root.version === 2 ? { sections: boundedItems(root.sections, "sections", 16, parseSection) } : {}),
  };
  if (options.forPublication) {
    if (result.header.logo.visible && !(result.header.logo.mode === "text" ? result.header.logo.text : result.header.logo.image.src)) invalid("header.logo", "The visible logo needs text or an image.");
    if (result.header.logo.visible && result.header.logo.mode === "image" && !result.header.logo.image.alt && !result.header.logo.text) invalid("header.logo.image.alt", "Give the logo an accessible name using alt text or logo text.");
    if (result.header.login.visible && (!result.header.login.label || !result.header.login.href)) invalid("header.login", "The visible login needs a label and internal destination.");
    if (result.hero.visible && !result.hero.heading) invalid("hero.heading", "The visible hero needs a heading.");
    if (result.hero.visible) {
      validateActiveMedia(result.hero.media, "hero.media");
      for (const block of result.hero.textBlocks ?? []) if (block.enabled && !block.text) invalid(`hero.textBlocks.${block.id}.text`, "An enabled hero text block needs text.");
    }
    if ((result.selector.visible !== false && !result.selector.heading) || !result.waitlist.heading || !result.waitlist.submitLabel || !result.waitlist.successHeading) invalid("copy", "Visible selector, waitlist, success headings and the submit label are required.");
    for (const category of result.categories) {
      if (category.visible && !category.name) invalid(`categories.${category.id}.name`, "A visible category needs a display name.");
      if (category.mode === "live_application" && !BUSINESS_SIGNUP_LIVE_APPLICATIONS[category.id]) invalid(`categories.${category.id}.mode`, "This category has no registered live application yet. Keep it on the waitlist until that flow is available.");
    }
    for (const section of result.sections ?? []) validateActiveSection(section);
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

export function visibleBusinessSignupHeroText(content: BusinessSignupContent) {
  return (content.hero.textBlocks ?? []).filter(block => block.enabled).sort((left, right) => left.order - right.order);
}

export function visibleBusinessSignupSections(content: BusinessSignupContent, placement: BusinessSignupSectionPlacement) {
  return (content.sections ?? []).filter(section => section.enabled && section.placement === placement).sort((left, right) => left.order - right.order);
}

/** New modules start as editable drafts; publication checks required visible fields. */
export function createBusinessSignupSection(type: BusinessSignupSectionType, id: string, placement: BusinessSignupSectionPlacement = "after_selector", order = 0): BusinessSignupSection {
  const base = { id, enabled: true, order, placement, heading: "", subheading: "", body: "" };
  switch (type) {
    case "text": return { ...base, type, variant: "default" };
    case "image_text": return { ...base, type, variant: "left", image: image() };
    case "features": return { ...base, type, variant: "grid", items: [] };
    case "stats": return { ...base, type, variant: "grid", items: [] };
    case "quote": return { ...base, type, variant: "card" };
    case "cta": return { ...base, type, variant: "centered", cta: { label: "", href: "" } };
    case "faq": return { ...base, type, variant: "accordion", items: [] };
    case "gallery": return { ...base, type, variant: "grid", items: [] };
    case "media": return { ...base, type, variant: "wide", media: { ...image(), type: "none", poster: image() } };
  }
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
