import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test } from "./helpers/hydration";

const harness = "/internal/acceptance/business-media";
const videoSource = "/videos/business/business-signup-hero.mp4";

// Exercise the component's browser media lifecycle without shipping footage or
// claiming real video decoding/playback. The src setter records assignments
// without starting a request; tests explicitly dispatch playback/error events.
async function installMediaFixture(page: Page, rejectPlay = false) {
  await page.addInitScript(({ rejectPlay }) => {
    const removeAttribute = Element.prototype.removeAttribute;
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() { return this.getAttribute("data-fixture-source") || ""; },
      set(value: string) { this.setAttribute("data-fixture-source", value); },
    });
    Element.prototype.removeAttribute = function (name: string) {
      if (this instanceof HTMLMediaElement && name === "src") removeAttribute.call(this, "data-fixture-source");
      removeAttribute.call(this, name);
    };
    HTMLMediaElement.prototype.play = function () {
      this.dataset.fixturePlayCalls = String(Number(this.dataset.fixturePlayCalls || 0) + 1);
      return rejectPlay ? Promise.reject(new DOMException("Autoplay fixture denial", "NotAllowedError")) : Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      this.dataset.fixturePauseCalls = String(Number(this.dataset.fixturePauseCalls || 0) + 1);
    };
    HTMLMediaElement.prototype.load = function () {
      this.dataset.fixtureLoadCalls = String(Number(this.dataset.fixtureLoadCalls || 0) + 1);
    };
  }, { rejectPlay });
}

test("business media defaults to independent images with neutral positioning and no zoom", async ({ page }) => {
  const mediaRequests: string[] = [];
  page.on("request", request => { if (request.resourceType() === "media") mediaRequests.push(request.url()); });
  await page.goto("/business/signup");
  const photos = page.locator(".business-photo img");
  await expect(photos).toHaveCount(12);
  for (const photo of await photos.all()) {
    await expect(photo).toHaveAttribute("src", /^\/images\/business\/[a-z]+-service\.avif$/);
    await expect(photo).toHaveCSS("object-fit", "cover");
    await expect(photo).toHaveCSS("object-position", "50% 50%");
    await expect(photo).toHaveCSS("transform", "none");
  }
  for (const frame of await page.locator(".business-photo").all()) {
    await expect(frame).toHaveCSS("transform", "none");
    await expect(frame).toHaveCSS("animation-name", "none");
  }
  await expect(page.locator("video")).toHaveCount(0);
  expect(mediaRequests).toEqual([]);
});

test("business image source, accessible alt, fit, position and aspect ratio are configurable", async ({ page }) => {
  await installMediaFixture(page);
  await page.goto(harness);
  const image = page.getByRole("img", { name: "Manicure service image fixture", exact: true });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", "/images/business/nails-service.avif");
  await expect(image).toHaveCSS("object-fit", "contain");
  await expect(image).toHaveCSS("object-position", "25% 75%");
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  const frame = page.getByRole("region", { name: "Configurable service image" }).locator(".business-photo");
  await expect(frame).toHaveCSS("aspect-ratio", "3 / 2");
  const box = await frame.boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(1.5);
  expect((await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});

test("single hero video waits for playback and keeps its poster on media error (media API fixture)", async ({ page }) => {
  await installMediaFixture(page);
  await page.goto(harness);
  const video = page.locator(".business-hero-video video");
  const poster = page.locator(".business-hero-video .business-photo img");
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute("data-fixture-source", videoSource);
  await expect(video).toHaveAttribute("data-fixture-play-calls", /^[1-9]\d*$/);
  expect(await video.evaluate((element: HTMLVideoElement) => ({
    autoplay: element.autoplay, muted: element.muted, loop: element.loop,
    playsInline: element.playsInline, controls: element.controls,
  }))).toEqual({ autoplay: true, muted: true, loop: true, playsInline: true, controls: false });
  await expect(video).toHaveAttribute("poster", "/images/business/hair-service.avif");
  await expect(video).toHaveCSS("object-fit", "cover");
  await expect(video).toBeHidden();
  await expect(poster).toBeVisible();
  await video.dispatchEvent("playing");
  await expect(video).toBeVisible();
  await video.dispatchEvent("error");
  await expect(video).toBeHidden();
  await expect(poster).toBeVisible();
  await expect(page.getByRole("region", { name: "Background video lifecycle fixture" }).getByRole("button", { includeHidden: true })).toHaveCount(0);
});

test("hero reduced motion avoids the video source and handles live preference changes (media API fixture)", async ({ page }) => {
  await installMediaFixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const mediaRequests: string[] = [];
  page.on("request", request => { if (request.resourceType() === "media") mediaRequests.push(request.url()); });
  await page.goto(harness);
  const video = page.locator(".business-hero-video video");
  const poster = page.locator(".business-hero-video .business-photo img");
  await expect(video).not.toHaveAttribute("src");
  await expect(video).not.toHaveAttribute("data-fixture-source");
  await expect(video).not.toHaveAttribute("data-fixture-play-calls");
  await expect(video).toBeHidden();
  await expect(poster).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(video).toHaveAttribute("data-fixture-source", videoSource);
  await expect(video).toHaveAttribute("data-fixture-play-calls", /^[1-9]\d*$/);
  await video.dispatchEvent("playing");
  await expect(video).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(video).not.toHaveAttribute("data-fixture-source");
  await expect(video).toHaveAttribute("data-fixture-pause-calls", /^[1-9]\d*$/);
  await expect(video).toHaveAttribute("data-fixture-load-calls", /^[1-9]\d*$/);
  await expect(video).toBeHidden();
  await expect(poster).toBeVisible();
  expect(mediaRequests).toEqual([]);
});

test("hero autoplay denial preserves its poster without player controls (media API fixture)", async ({ page }) => {
  await installMediaFixture(page, true);
  await page.goto(harness);
  const video = page.locator(".business-hero-video video");
  await expect(video).toHaveAttribute("data-fixture-play-calls", /^[1-9]\d*$/);
  await expect(video).toBeHidden();
  await expect(page.locator(".business-hero-video .business-photo img")).toBeVisible();
  expect(await video.evaluate((element: HTMLVideoElement) => element.controls)).toBe(false);
  await expect(page.getByRole("region", { name: "Background video lifecycle fixture" }).getByRole("button", { includeHidden: true })).toHaveCount(0);
});

test("missing local hero video returns 404 and preserves its loaded poster in the real browser", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const response = page.waitForResponse(response => new URL(response.url()).pathname === videoSource);
  await page.goto(harness);
  expect((await response).status()).toBe(404);
  const video = page.locator(".business-hero-video video");
  const poster = page.locator(".business-hero-video .business-photo img");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.error !== null)).toBe(true);
  await expect(video).toBeHidden();
  await expect(poster).toBeVisible();
  await expect.poll(() => poster.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  expect(await video.evaluate((element: HTMLVideoElement) => element.controls)).toBe(false);
});
