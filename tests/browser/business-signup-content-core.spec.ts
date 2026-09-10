import { expect, test } from "@playwright/test";
import {
  BUSINESS_SIGNUP_CONTENT_LABEL,
  DEFAULT_BUSINESS_SIGNUP_CONTENT,
  businessSignupCategoryHref,
  decodeBusinessSignupContent,
  encodeBusinessSignupContent,
  interpolateBusinessSignupTemplate,
  safeBusinessSignupInternalHref,
  validateBusinessSignupContent,
  visibleBusinessCategories,
} from "../../src/lib/businessSignupContent";

const draft = () => structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);

test("business signup content preserves approved defaults through the existing labels JSON contract", () => {
  const content = draft();
  const encoded = encodeBusinessSignupContent(content, { forPublication: true });
  expect(typeof encoded).toBe("string");
  expect(decodeBusinessSignupContent({ [BUSINESS_SIGNUP_CONTENT_LABEL]: encoded })).toEqual(content);
  expect(content.header.logo.text).toBe("Girlz Culture");
  expect(content.hero.heading).toBe("Grow Your Beauty Business");
  expect(content.hero.supportingText).toBe("Get discovered by more clients, manage your business all in one place, and be part of a supportive community built for beauty entrepreneurs.");
  expect(content.selector).toEqual({ heading: "What’s Your Business?", supportingText: "Select the category that best fits your business." });
  expect(content.waitlist.eyebrow).toBe("EARLY ACCESS");
  expect(content.waitlist.submitLabel).toBe("Join the Waitlist");
  expect(content.categories).toHaveLength(8);
  expect(content.trust).toHaveLength(3);
});

test("business content round-trip retains edited media, copy, bounded presentation and stable category ordering", () => {
  const content = draft();
  content.header.logo.mode = "image";
  content.header.logo.image = { src: "/images/business/nails-service.avif", alt: "Studio identity", fit: "contain", focalX: 20, focalY: 80 };
  content.header.logo.size = "small";
  content.header.login.helperText = "Welcome back";
  content.hero.heading = "Build your business";
  content.hero.supportingText = "An edited introduction.";
  content.hero.overlay = "strong";
  content.hero.media = { ...content.hero.media, src: "/videos/business/business-signup-hero.mp4", type: "video", focalX: 0, focalY: 100 };
  content.categories[1].name = "Nail Artists";
  content.categories[1].order = 0;
  content.categories[0].order = 7;
  content.categories[2].visible = false;
  content.categories[1].waitlist = { heading: "Join {businessType}", description: "Get notified about local access.", image: content.header.logo.image };
  content.trust[0].icon = "heart";
  content.trust[0].heading = "Your community";
  const persisted = decodeBusinessSignupContent({ [BUSINESS_SIGNUP_CONTENT_LABEL]: encodeBusinessSignupContent(content, { forPublication: true }) });
  expect(persisted).toEqual(content);
  expect(visibleBusinessCategories(persisted).map(category => category.id)).toEqual([
    "nail-studio", "aesthetics-clinic", "tattoo-studio", "lash-brow-bar", "barbershop", "hair-salon-braiding", "other",
  ]);
  expect(persisted.categories[0].id).toBe("hair-salon-braiding");
});

test("business content preserves explicit empty media, empty overrides and false visibility", () => {
  const content = draft();
  content.header.logo.visible = false;
  content.header.logo.text = "";
  content.header.login.visible = false;
  content.header.login.href = "";
  content.hero.media.type = "none";
  content.hero.media.src = "";
  content.hero.media.poster.src = "";
  content.hero.visible = false;
  content.categories[1].image.src = "";
  content.categories[1].visible = false;
  content.categories[1].waitlist = { heading: "", description: "", image: { ...content.categories[1].image, src: "" } };
  content.trust[0].visible = false;
  expect(decodeBusinessSignupContent({ [BUSINESS_SIGNUP_CONTENT_LABEL]: encodeBusinessSignupContent(content, { forPublication: true }) })).toEqual(content);
});

test("business content rejects unsafe destinations, injected markup and unsupported style fields", () => {
  for (const href of ["//evil.example", "https://evil.example", "javascript:alert(1)", "/\\evil.example", "/%2f%2fevil.example", "/%5cevil.example", "/business/login%0a", "/business/login\n"]) {
    expect(safeBusinessSignupInternalHref(href), href).toBeNull();
    const content = draft();
    content.header.login.href = href;
    expect(() => validateBusinessSignupContent(content), href).toThrow();
  }
  for (const src of ["javascript:alert(1)", "data:image/svg+xml,<svg onload=alert(1)>", "//evil.example/image.png", "http://media.example/image.png", "https://media.example/image.png", "https://user:password@media.example/image.png", "/api/admin/content", "/images/../api/admin/content"]) {
    const content = draft();
    content.hero.media.src = src;
    expect(() => validateBusinessSignupContent(content), src).toThrow();
  }
  const markup = draft();
  markup.hero.heading = '<img src=x onerror="alert(1)">';
  expect(() => validateBusinessSignupContent(markup)).toThrow(/HTML/);
  const rawStyle = { ...draft(), style: "position:fixed" };
  expect(() => validateBusinessSignupContent(rawStyle)).toThrow(/Unsupported/);
  expect(safeBusinessSignupInternalHref("/business/login?return=%2Fbusiness%2Fsignup#account")).toBe("/business/login?return=%2Fbusiness%2Fsignup#account");
});

test("business media accepts this deployment's public storage and rejects foreign or private storage", () => {
  const previousStorage = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousHarness = process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://content-fixture.supabase.co";
    const content = draft();
    content.categories[1].image.src = "https://content-fixture.supabase.co/storage/v1/object/public/content-media/business-signup/nails.jpg";
    expect(validateBusinessSignupContent(content).categories[1].image.src).toBe(content.categories[1].image.src);
    for (const src of [
      "https://another-project.supabase.co/storage/v1/object/public/content-media/hero.jpg",
      "https://content-fixture.supabase.co/storage/v1/object/public/application-media/private.jpg",
      "https://content-fixture.supabase.co/storage/v1/object/sign/content-media/hero.jpg",
      "https://content-fixture.supabase.co.evil.example/storage/v1/object/public/content-media/hero.jpg",
    ]) {
      content.categories[1].image.src = src;
      expect(() => validateBusinessSignupContent(content), src).toThrow();
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:3105";
    content.categories[1].image.src = "http://127.0.0.1:3105/storage/v1/object/public/content-media/local.jpg";
    delete process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS;
    expect(() => validateBusinessSignupContent(content)).toThrow();
    process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS = "true";
    expect(validateBusinessSignupContent(content).categories[1].image.src).toBe(content.categories[1].image.src);
  } finally {
    if (previousStorage === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousStorage;
    if (previousHarness === undefined) delete process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS;
    else process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS = previousHarness;
  }
});

test("business content rejects non-finite coordinates, invalid enums and replaced or duplicated identities", () => {
  for (const value of [NaN, Infinity, -1, 101, "50"]) {
    const content = draft();
    Object.assign(content.hero.media, { focalX: value });
    expect(() => validateBusinessSignupContent(content)).toThrow(/focalX/);
  }
  const unsafeIcon = draft();
  Object.assign(unsafeIcon.trust[0], { icon: "<svg>" });
  expect(() => validateBusinessSignupContent(unsafeIcon)).toThrow(/icon/);
  const duplicate = draft();
  duplicate.categories[1].id = duplicate.categories[0].id;
  expect(() => validateBusinessSignupContent(duplicate)).toThrow(/unique/);
  const missing = draft();
  missing.categories.pop();
  expect(() => validateBusinessSignupContent(missing)).toThrow(/eight/);
  const replaced = draft();
  Object.assign(replaced.categories[0], { id: "arbitrary-category" });
  expect(() => validateBusinessSignupContent(replaced)).toThrow(/id/);
  const unsupportedFit = draft();
  Object.assign(unsupportedFit.categories[0].image, { fit: "fill" });
  expect(() => validateBusinessSignupContent(unsupportedFit)).toThrow(/fit/);
});

test("category destination modes cannot send unimplemented businesses into the Hair application", () => {
  const content = draft();
  const hair = content.categories[0];
  expect(businessSignupCategoryHref(hair)).toBe("/business/signup/hair");
  expect(businessSignupCategoryHref(hair, "growth")).toBe("/business/signup/hair?plan=growth");
  for (const invalidPlan of ["", "invalid", "pro", ["starter", "growth"], undefined]) {
    expect(businessSignupCategoryHref(hair, invalidPlan)).toBe("/business/signup/hair");
  }
  for (const category of content.categories.slice(1)) {
    expect(businessSignupCategoryHref(category, "premium")).toBe(`/business/waitlist?category=${category.id}`);
  }
  content.categories[1].mode = "live_application";
  expect(validateBusinessSignupContent(content).categories[1].mode).toBe("live_application");
  expect(businessSignupCategoryHref(content.categories[1], "premium")).toBeNull();
  expect(() => validateBusinessSignupContent(content, { forPublication: true })).toThrow(/no registered live application/);
  hair.mode = "waitlist";
  expect(businessSignupCategoryHref(hair, "premium")).toBe("/business/waitlist?category=hair-salon-braiding");
});

test("animated hero publication requires a still reduced-motion fallback", () => {
  for (const type of ["video", "gif"] as const) {
    const content = draft();
    content.hero.media.type = type;
    content.hero.media.src = type === "video" ? "/videos/business/business-signup-hero.mp4" : "/images/business/hero.gif";
    content.hero.media.poster.src = "";
    expect(() => validateBusinessSignupContent(content, { forPublication: true })).toThrow(/still poster/);
    content.hero.media.poster.src = "/images/business/another-animation.gif";
    expect(() => validateBusinessSignupContent(content, { forPublication: true })).toThrow(/still poster/);
    content.hero.media.poster.src = "/images/business/hair-service.avif";
    expect(validateBusinessSignupContent(content, { forPublication: true }).hero.media.type).toBe(type);
  }
});

test("malformed stored business content cannot expose unsafe values and fallback objects remain independent", () => {
  const unsafe = draft();
  unsafe.header.login.href = "javascript:alert(1)";
  for (const labels of [null, [], {}, { business_signup: "{" }, { business_signup: JSON.stringify(unsafe) }, { business_signup: "x".repeat(64_001) }]) {
    expect(decodeBusinessSignupContent(labels)).toEqual(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  }
  const first = decodeBusinessSignupContent(null);
  first.header.logo.text = "Locally edited draft";
  expect(decodeBusinessSignupContent(null).header.logo.text).toBe("Girlz Culture");
});

test("waitlist copy interpolation changes presentation without changing stable routing identity", () => {
  const category = draft().categories[1];
  category.name = "Nail Artists";
  expect(interpolateBusinessSignupTemplate("Join the {businessType} Waitlist", category.name)).toBe("Join the Nail Artists Waitlist");
  expect(interpolateBusinessSignupTemplate("[Business Type] — {businessType}", category.name)).toBe("Nail Artists — Nail Artists");
  expect(businessSignupCategoryHref(category)).toBe("/business/waitlist?category=nail-studio");
});
