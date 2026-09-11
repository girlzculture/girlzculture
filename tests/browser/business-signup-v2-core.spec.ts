import { expect, test } from "@playwright/test";
import {
  BUSINESS_SIGNUP_SECTION_TYPES, DEFAULT_BUSINESS_SIGNUP_CONTENT, createBusinessSignupSection,
  decodeBusinessSignupContent, encodeBusinessSignupContent, upgradeBusinessSignupContent,
  validateBusinessSignupContent, visibleBusinessSignupHeroText, visibleBusinessSignupSections,
  type BusinessSignupSectionType,
} from "../../src/lib/businessSignupContent";

const draft = () => upgradeBusinessSignupContent(DEFAULT_BUSINESS_SIGNUP_CONTENT);
const photo = () => structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT.categories[0].image);
function completedSection(type: BusinessSignupSectionType, id = `section-${type.replaceAll("_", "-")}`) {
  const section = createBusinessSignupSection(type, id);
  section.heading = "A founder-managed section";
  section.subheading = "Supporting copy";
  section.body = "Useful information in plain text.\nA second paragraph stays in the DOM.";
  section.cta = { label: "Learn more", href: "/how-it-works" };
  if (section.type === "image_text") section.image = photo();
  if (section.type === "features") section.items = [{ id: "feature-one", icon: "heart", heading: "A helpful feature", body: "Feature information" }];
  if (section.type === "stats") section.items = [{ id: "stat-one", value: "Your choice", label: "Flexible setup" }];
  if (section.type === "quote") { section.author = "Founder"; section.role = "Business owner"; section.image = photo(); }
  if (section.type === "faq") section.items = [{ id: "question-one", question: "How do I get started?", answer: "Choose your business category." }];
  if (section.type === "gallery") section.items = [{ id: "image-one", image: photo() }];
  if (section.type === "media") section.media = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT.hero.media);
  return section;
}

test("version 1 stays byte-stable while its in-memory version 2 adapter adds only empty optional regions", () => {
  const original = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  const serialized = JSON.stringify(original);
  expect(encodeBusinessSignupContent(original, { forPublication: true })).toBe(serialized);
  const adapted = upgradeBusinessSignupContent(original);
  expect(adapted.version).toBe(2);
  expect(adapted.hero.textBlocks).toEqual([]);
  expect(adapted.selector.visible).toBe(true);
  expect(adapted.sections).toEqual([]);
  const { textBlocks: _textBlocks, ...hero } = adapted.hero;
  const { visible: _visible, ...selector } = adapted.selector;
  expect(_textBlocks).toEqual([]);
  expect(_visible).toBe(true);
  expect(hero).toEqual(original.hero);
  expect(selector).toEqual(original.selector);
  expect(adapted.categories).toEqual(original.categories);
  adapted.header.logo.text = "New draft";
  expect(JSON.stringify(original)).toBe(serialized);
});

for (const type of BUSINESS_SIGNUP_SECTION_TYPES) {
  test(`version 2 ${type} module round-trips with its typed fields and optional internal CTA`, () => {
    const content = draft();
    content.sections = [completedSection(type)];
    const encoded = encodeBusinessSignupContent(content, { forPublication: true });
    expect(decodeBusinessSignupContent({ business_signup: encoded })).toEqual(content);
    expect(validateBusinessSignupContent(JSON.parse(encoded), { forPublication: true })).toEqual(content);
  });
}

test("hero additions, selector visibility, section placement and ordering preserve stable identities", () => {
  const content = draft();
  content.hero.textBlocks = [
    { id: "line-later", text: "Later line", enabled: true, order: 9 },
    { id: "line-hidden", text: "", enabled: false, order: 0 },
    { id: "line-first", text: "First line", enabled: true, order: 1 },
  ];
  content.selector.visible = false;
  content.selector.heading = "";
  const first = completedSection("text", "section-first");
  const later = completedSection("quote", "section-later");
  const hidden = completedSection("cta", "section-hidden");
  first.placement = later.placement = "after_hero";
  first.order = 1; later.order = 8; hidden.enabled = false;
  content.sections = [later, hidden, first, completedSection("faq", "section-below-selector")];
  const before = structuredClone(content);
  expect(visibleBusinessSignupHeroText(content).map(block => block.id)).toEqual(["line-first", "line-later"]);
  expect(visibleBusinessSignupSections(content, "after_hero").map(section => section.id)).toEqual(["section-first", "section-later"]);
  expect(visibleBusinessSignupSections(content, "after_selector").map(section => section.id)).toEqual(["section-below-selector"]);
  expect(validateBusinessSignupContent(content, { forPublication: true })).toEqual(before);
  expect(content).toEqual(before);
});

test("optional removal and disabled empty modules survive draft and publication without defaults returning", () => {
  const content = draft();
  content.sections = BUSINESS_SIGNUP_SECTION_TYPES.map(type => ({ ...createBusinessSignupSection(type, `disabled-${type.replaceAll("_", "-")}`), enabled: false }));
  const quote = completedSection("quote");
  if (quote.type !== "quote") throw new Error("Fixture quote missing");
  delete quote.image; delete quote.author; delete quote.role; delete quote.cta;
  quote.subheading = "";
  content.sections.push(quote);
  expect(decodeBusinessSignupContent({ business_signup: encodeBusinessSignupContent(content, { forPublication: true }) })).toEqual(content);
  expect(content.sections.at(-1)).not.toHaveProperty("image");
});

test("publication rejects incomplete enabled modules and text but allows a draft to retain edits", () => {
  for (const type of BUSINESS_SIGNUP_SECTION_TYPES.filter(type => type !== "media")) {
    const content = draft();
    content.sections = [createBusinessSignupSection(type, "unfinished-section")];
    expect(() => validateBusinessSignupContent(content)).not.toThrow();
    expect(() => validateBusinessSignupContent(content, { forPublication: true }), type).toThrow();
  }
  const content = draft();
  content.hero.textBlocks = [{ id: "unfinished-line", text: "", enabled: true, order: 0 }];
  expect(() => validateBusinessSignupContent(content, { forPublication: true })).toThrow(/hero.textBlocks/);
  content.hero.visible = false;
  expect(() => validateBusinessSignupContent(content, { forPublication: true })).not.toThrow();
});

test("version 2 rejects markup, raw styles, unapproved variants and unsafe CTA/media in active or disabled modules", () => {
  const unsafeValues = [
    { body: "<script>alert(1)</script>" }, { className: "fixed" }, { style: { position: "fixed" } },
    { variant: "arbitrary-grid" }, { iframe: "https://example.com" },
    { cta: { label: "Go", href: "https://evil.example" } },
    { cta: { label: "Go", href: "/%2f%2fevil.example" } },
    { cta: { label: "Go", href: "javascript:alert(1)" } },
  ];
  for (const patch of unsafeValues) for (const enabled of [true, false]) {
    const content = draft();
    content.sections = [{ ...completedSection("text"), ...patch, enabled }] as typeof content.sections;
    expect(() => validateBusinessSignupContent(content)).toThrow();
    expect(decodeBusinessSignupContent({ business_signup: JSON.stringify(content) })).toEqual(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  }
  const content = draft();
  const section = completedSection("image_text");
  if (section.type !== "image_text") throw new Error("Fixture image missing");
  section.image.src = "data:image/svg+xml,<svg onload=alert(1)>";
  content.sections = [section];
  expect(() => validateBusinessSignupContent(content)).toThrow();
});

test("new fields require version 2 and IDs, list sizes and numeric framing stay bounded", () => {
  const legacy = { ...structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT), sections: [] };
  expect(() => validateBusinessSignupContent(legacy)).toThrow(/version 2/);
  expect(() => validateBusinessSignupContent({ ...draft(), version: 3 })).toThrow(/version/);
  const content = draft();
  content.sections = [completedSection("text"), completedSection("text")];
  expect(() => validateBusinessSignupContent(content)).toThrow(/unique/);
  content.sections = [completedSection("text", "../unsafe")];
  expect(() => validateBusinessSignupContent(content)).toThrow(/identifier/);
  content.sections = Array.from({ length: 17 }, (_, index) => completedSection("text", `section-${index}`));
  expect(() => validateBusinessSignupContent(content)).toThrow(/at most 16/);
  content.sections = [completedSection("gallery")];
  if (content.sections[0].type !== "gallery") throw new Error("Fixture gallery missing");
  content.sections[0].items = [{ id: "duplicate", image: photo() }, { id: "duplicate", image: photo() }];
  expect(() => validateBusinessSignupContent(content)).toThrow(/unique/);
  content.sections[0].items = [{ id: "image-one", image: { ...photo(), focalX: Number.NaN } }];
  expect(() => validateBusinessSignupContent(content)).toThrow(/number/);
});

test("media modules require still fallback for animation and retain intentional none mode", () => {
  const content = draft();
  const section = completedSection("media");
  if (section.type !== "media") throw new Error("Fixture media missing");
  content.sections = [section];
  for (const type of ["gif", "video"] as const) {
    section.media.type = type;
    section.media.src = type === "gif" ? "/images/example.gif" : "/videos/example.mp4";
    section.media.poster.src = "";
    expect(() => validateBusinessSignupContent(content, { forPublication: true })).toThrow(/still poster/);
    section.media.poster = photo();
    expect(() => validateBusinessSignupContent(content, { forPublication: true })).not.toThrow();
  }
  section.media.type = "none";
  section.media.src = "";
  section.media.poster.src = "";
  expect(validateBusinessSignupContent(content, { forPublication: true }).sections).toEqual(content.sections);
});
