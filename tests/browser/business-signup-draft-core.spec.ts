import { expect, test } from "@playwright/test";
import { DEFAULT_BUSINESS_SIGNUP_CONTENT, type BusinessSignupContent } from "../../src/lib/businessSignupContent";
import { mergeBusinessSignupDraft } from "../../src/lib/businessSignupDraftCore";

function deferredUpload() {
  let finish!: (url: string) => void;
  const result = new Promise<string>(resolve => { finish = resolve; });
  return { result, finish };
}

test("finishing a delayed hero upload preserves copy and framing edited while the upload was running", async () => {
  let current = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  const uploadStartedWith = structuredClone(current);
  const upload = deferredUpload();
  const completed = upload.result.then(src => {
    const next = { ...uploadStartedWith, hero: { ...uploadStartedWith.hero, media: { ...uploadStartedWith.hero.media, src } } };
    current = mergeBusinessSignupDraft(uploadStartedWith, next, current);
  });

  const beforeTyping = structuredClone(current);
  const edited = structuredClone(current);
  edited.hero.heading = "The new heading typed during upload";
  edited.hero.media.focalX = 84;
  edited.header.login.label = "Return to your account";
  edited.waitlist.supportText = "We will help you get ready.";
  current = mergeBusinessSignupDraft(beforeTyping, edited, current);

  upload.finish("/images/business/finished-hero.jpg");
  await completed;

  expect(current.hero.media.src).toBe("/images/business/finished-hero.jpg");
  expect(current.hero.heading).toBe(edited.hero.heading);
  expect(current.hero.media.focalX).toBe(84);
  expect(current.header.login.label).toBe(edited.header.login.label);
  expect(current.waitlist.supportText).toBe(edited.waitlist.supportText);
  expect(uploadStartedWith).toEqual(DEFAULT_BUSINESS_SIGNUP_CONTENT);
});

test("independent category uploads finishing out of order preserve both media replacements and newer category edits", async () => {
  let current = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  const start = structuredClone(current);
  const nails = deferredUpload();
  const barber = deferredUpload();
  const finishCategory = (base: BusinessSignupContent, index: number, src: string) => {
    const next = structuredClone(base);
    next.categories[index].image.src = src;
    current = mergeBusinessSignupDraft(base, next, current);
  };
  const nailsCompleted = nails.result.then(src => finishCategory(start, 1, src));
  const barberCompleted = barber.result.then(src => finishCategory(start, 6, src));

  const edited = structuredClone(current);
  edited.categories[1].name = "Nail Artists";
  edited.categories[1].order = 0;
  edited.categories[6].visible = false;
  current = mergeBusinessSignupDraft(start, edited, current);
  barber.finish("/images/business/new-barber.jpg");
  await barberCompleted;
  nails.finish("/images/business/new-nails.jpg");
  await nailsCompleted;

  expect(current.categories[1]).toMatchObject({ id: "nail-studio", name: "Nail Artists", order: 0, image: { src: "/images/business/new-nails.jpg" } });
  expect(current.categories[6]).toMatchObject({ id: "barbershop", visible: false, image: { src: "/images/business/new-barber.jpg" } });
});

test("draft merges retain intermediate text and explicit optional-field removal without resetting other sections", () => {
  const before = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  before.categories[1].waitlist = { heading: "Special invitation", description: "Keep this description." };
  const current = structuredClone(before);
  current.hero.heading = "A separately edited heading";
  current.trust[1].visible = false;
  const next = structuredClone(before);
  next.categories[1].image.src = "/i";
  delete next.categories[1].waitlist!.heading;

  const result = mergeBusinessSignupDraft(before, next, current);

  expect(result.categories[1].image.src).toBe("/i");
  expect(result.categories[1].waitlist).toEqual({ description: "Keep this description." });
  expect(result.hero.heading).toBe(current.hero.heading);
  expect(result.trust[1].visible).toBe(false);
  expect(current.categories[1].waitlist?.heading).toBe("Special invitation");
});


test("verifying a saved snapshot retains an upload that finished during the save", async () => {
  const submitted = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  submitted.hero.heading = "Saved heading";
  let current = structuredClone(submitted);
  const upload = deferredUpload();
  const completed = upload.result.then(src => {
    current = { ...current, hero: { ...current.hero, media: { ...current.hero.media, src } } };
  });
  upload.finish("/images/business/facial-service.avif");
  await completed;
  const persisted = structuredClone(submitted);
  current = mergeBusinessSignupDraft(submitted, current, persisted);
  expect(current.hero.heading).toBe("Saved heading");
  expect(current.hero.media.src).toBe("/images/business/facial-service.avif");
  expect(persisted.hero.media.src).toBe(DEFAULT_BUSINESS_SIGNUP_CONTENT.hero.media.src);
});
