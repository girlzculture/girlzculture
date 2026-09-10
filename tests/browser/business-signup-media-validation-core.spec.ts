import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contentCore from "../../src/lib/businessSignupContent";
import type { validateBusinessSignupMediaForPublication } from "../../src/lib/businessSignupMediaValidationServer";

const storage = "https://project.supabase.co/storage/v1/object/public/content-media/";
const source = `${storage}hero-desktop-neutral.img`;
const poster = `${storage}poster-desktop-neutral.img`;
type RegistryRow = { public_url: string; bucket_id: string; mime_type: string; source_mime_type: string | null; status: string; renditions: unknown };

function asset(url: string, mime: string, patch: Partial<RegistryRow> = {}): RegistryRow {
  return { public_url: url, bucket_id: "content-media", mime_type: mime, source_mime_type: mime, status: "Attached", renditions: { desktop: { url, mime_type: mime } }, ...patch };
}

// Execute the actual server helper, replacing only its server-only marker and
// registry dependency. No web server, storage request, or project mutation.
function isolatedValidation(rows: RegistryRow[] = [], storageError = false) {
  const queriedUrls: string[][] = [];
  const admin = { from: (table: string) => {
    expect(table).toBe("media_assets");
    return { select: (columns: string) => {
      expect(columns).toBe("public_url,bucket_id,mime_type,source_mime_type,status,renditions");
      return { eq: (column: string, value: string) => {
        expect([column, value]).toEqual(["bucket_id", "content-media"]);
        return { in: async (column: string, urls: string[]) => {
          expect(column).toBe("public_url");
          queriedUrls.push(urls);
          return { data: rows.filter(row => urls.includes(row.public_url)), error: storageError ? { message: "Private database diagnostic" } : null };
        } };
      } };
    } };
  } };
  const filename = resolve("src/lib/businessSignupMediaValidationServer.ts");
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helper = { exports: {} as { validateBusinessSignupMediaForPublication: typeof validateBusinessSignupMediaForPublication } };
  const nativeRequire = createRequire(filename);
  runInNewContext(compiled, {
    module: helper, exports: helper.exports, URL,
    require: (name: string) => name === "server-only" ? {} : name === "./businessSignupContent" ? contentCore : nativeRequire(name),
  }, { filename });
  return {
    queriedUrls,
    validate: async (content: contentCore.BusinessSignupContent) => {
      await helper.exports.validateBusinessSignupMediaForPublication(admin as unknown as Parameters<typeof validateBusinessSignupMediaForPublication>[0], content);
    },
  };
}

const defaults = () => structuredClone(contentCore.DEFAULT_BUSINESS_SIGNUP_CONTENT);

test("business hero publication accepts trusted local defaults without a registry query", async () => {
  const helper = isolatedValidation();
  const content = defaults();
  await helper.validate(content);
  expect(helper.queriedUrls).toEqual([]);
  expect(content).toEqual(defaults());
});

test("Image mode rejects registered GIFs with neutral or misleading filename extensions", async () => {
  for (const url of [source, `${storage}looks-static.png`]) {
    const helper = isolatedValidation([asset(url, "image/gif")]);
    const content = defaults();
    content.hero.media.src = url;
    await expect(helper.validate(content)).rejects.toThrow("This upload is a GIF. Choose GIF and provide a still poster");
    expect(helper.queriedUrls).toEqual([[url]]);
  }
});

test("GIF publication accepts verified animation plus a separately verified still poster", async () => {
  const helper = isolatedValidation([asset(source, "image/gif"), asset(poster, "image/jpeg")]);
  const content = defaults();
  content.hero.media.type = "gif";
  content.hero.media.src = source;
  content.hero.media.poster.src = poster;
  await helper.validate(content);
  expect(helper.queriedUrls).toEqual([[source, poster]]);
});

test("animated neutral-extension posters are rejected for both GIF and video modes", async () => {
  for (const [type, mime] of [["gif", "image/gif"], ["video", "video/mp4"]] as const) {
    const helper = isolatedValidation([asset(source, mime), asset(poster, "image/gif")]);
    const content = defaults();
    content.hero.media.type = type;
    content.hero.media.src = source;
    content.hero.media.poster.src = poster;
    await expect(helper.validate(content)).rejects.toThrow("Use a still JPG, PNG, or AVIF poster");
  }
});

test("original and matching rendition GIF metadata cannot be disguised by a still MIME field", async () => {
  for (const patch of [
    { source_mime_type: "image/gif" },
    { renditions: { desktop: { url: source, mime_type: "image/gif" } } },
  ]) {
    const helper = isolatedValidation([asset(source, "image/png", patch)]);
    const content = defaults();
    content.hero.media.src = source;
    await expect(helper.validate(content)).rejects.toThrow("Choose GIF");
  }
});

test("MP4 publication requires a verified video source and a still poster", async () => {
  const helper = isolatedValidation([asset(source, "video/mp4"), asset(poster, "image/png")]);
  const content = defaults();
  content.hero.media.type = "video";
  content.hero.media.src = source;
  content.hero.media.poster.src = poster;
  await helper.validate(content);
  content.hero.media.poster.src = "";
  await expect(helper.validate(content)).rejects.toThrow("Choose a still poster");
});

test("declared hero media mode must match the trusted format", async () => {
  for (const [type, mime, message] of [
    ["image", "video/mp4", "Image mode requires a still"],
    ["gif", "image/jpeg", "GIF mode requires a verified GIF"],
    ["video", "image/jpeg", "Video mode requires a verified MP4"],
  ] as const) {
    const helper = isolatedValidation([asset(source, mime)]);
    const content = defaults();
    content.hero.media.type = type;
    content.hero.media.src = source;
    await expect(helper.validate(content)).rejects.toThrow(message);
  }
});

test("unknown, quarantined, inconsistent and unverifiable uploaded media fail closed", async () => {
  const content = defaults();
  content.hero.media.src = source;
  for (const [rows, message] of [
    [[], "no verified upload record"],
    [[asset(source, "image/png", { status: "Quarantined" })], "Choose an available"],
    [[asset(source, "image/png", { bucket_id: "other-bucket" })], "Choose an available"],
    [[asset(source, "application/octet-stream")], "format could not be verified"],
    [[asset(source, "image/png", { renditions: { desktop: { url: source, mime_type: "video/mp4" } } })], "conflicting media metadata"],
  ] as [RegistryRow[], string][]) {
    await expect(isolatedValidation(rows).validate(content)).rejects.toThrow(message);
  }
  await expect(isolatedValidation([], true).validate(content)).rejects.toThrow("Save your draft and retry publishing");
});

test("canonical upload lookup deduplicates source and poster and retains archived snapshot assets", async () => {
  const helper = isolatedValidation([asset(source, "image/png", { status: "Archived", source_mime_type: null, renditions: {} })]);
  const content = defaults();
  content.hero.media.src = `${source}?cache=1#preview`;
  content.hero.media.poster.src = source;
  await helper.validate(content);
  expect(helper.queriedUrls).toEqual([[source]]);
});

test("hidden, removed and disabled heroes preserve inactive media without publication lookups", async () => {
  for (const mode of ["hidden", "removed", "none"] as const) {
    const helper = isolatedValidation();
    const content = defaults();
    content.hero.media.src = source;
    if (mode === "hidden") content.hero.visible = false;
    if (mode === "removed") content.hero.media.src = "";
    if (mode === "none") content.hero.media.type = "none";
    const before = structuredClone(content);
    await helper.validate(content);
    expect(helper.queriedUrls).toEqual([]);
    expect(content).toEqual(before);
  }
});

test("local GIF sources use GIF mode and local animated posters cannot bypass validation", async () => {
  const helper = isolatedValidation();
  const content = defaults();
  content.hero.media.src = "/images/business/future-animation.gif";
  await expect(helper.validate(content)).rejects.toThrow("Choose GIF");
  content.hero.media.type = "gif";
  await helper.validate(content);
  content.hero.media.poster.src = "/images/business/future-animation.gif";
  await expect(helper.validate(content)).rejects.toThrow("Use a still JPG, PNG, or AVIF poster");
  expect(helper.queriedUrls).toEqual([]);
});

function withActiveImage(field: "logo" | "category" | "waitlist", src: string) {
  const content = defaults();
  content.hero.visible = false;
  if (field === "logo") {
    content.header.logo.mode = "image";
    content.header.logo.image.src = src;
  } else if (field === "category") {
    content.categories[1].image.src = src;
  } else {
    content.categories[1].waitlist = { image: { ...content.categories[1].image, src } };
  }
  return content;
}

test("active logo, card and waitlist image fields reject local and registered video even with a hidden hero", async () => {
  for (const field of ["logo", "category", "waitlist"] as const) {
    for (const src of ["/videos/business/business-signup-hero.mp4", source]) {
      const helper = isolatedValidation([asset(source, "video/mp4")]);
      await expect(helper.validate(withActiveImage(field, src))).rejects.toThrow("This field displays an image. Choose a still image or GIF, not a video.");
    }
  }
});

test("ordinary image fields accept registered stills and GIFs in one deduplicated publication lookup", async () => {
  const helper = isolatedValidation([asset(source, "image/gif"), asset(poster, "image/png")]);
  const content = withActiveImage("logo", source);
  content.categories[1].image.src = poster;
  content.categories[1].waitlist = { image: { ...content.categories[1].image, src: source } };
  await helper.validate(content);
  expect(helper.queriedUrls).toEqual([[source, poster]]);
});

test("hidden image fields and live-category waitlist overrides remain inactive during publication", async () => {
  const helper = isolatedValidation();
  const content = withActiveImage("logo", source);
  content.header.logo.visible = false;
  content.categories[1].visible = false;
  content.categories[1].image.src = source;
  content.categories[1].waitlist = { image: { ...content.categories[1].image, src: source } };
  content.categories[0].waitlist = { image: { ...content.categories[0].image, src: source } };
  const before = structuredClone(content);
  await helper.validate(content);
  expect(helper.queriedUrls).toEqual([]);
  expect(content).toEqual(before);
});

test("image-only fields cannot publish an unregistered storage URL by using a photo suffix", async () => {
  for (const field of ["logo", "category", "waitlist"] as const) {
    await expect(isolatedValidation().validate(withActiveImage(field, `${storage}unregistered.jpg`))).rejects.toThrow("no verified upload record");
  }
});

test("existing local SVG and WebP remain valid ordinary images without certifying them as hero posters", async () => {
  const helper = isolatedValidation();
  const content = withActiveImage("logo", "/images/logo.svg");
  content.categories[1].image.src = "/images/existing-photo.webp";
  await helper.validate(content);
  expect(helper.queriedUrls).toEqual([]);
  content.hero.visible = true;
  content.hero.media.poster.src = "/images/logo.svg";
  await expect(helper.validate(content)).rejects.toThrow("Choose a supported local");
});
