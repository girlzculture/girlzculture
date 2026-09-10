import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { test } from "./helpers/hydration";
import { inspectBusinessHeroMp4 } from "../../src/lib/businessHeroVideoCore";

const harness = "/internal/acceptance/business-media";
const videoSource = "/videos/business/business-signup-hero.mp4";
const fixture = readFileSync(resolve("tests/fixtures/business-hero-flower.mp4"));

/** A local CC0 fixture supplies real encoded frames. No media methods or events are replaced. */
async function provideEncodedVideo(page: Page) {
  expect(createHash("sha256").update(fixture).digest("hex")).toBe("0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451");
  expect(inspectBusinessHeroMp4(new Uint8Array(fixture))).toEqual({ width: 960, height: 540, durationSeconds: 5.055, mimeType: "video/mp4" });
  let requests = 0;
  await page.route(`**${videoSource}`, async route => {
    requests += 1;
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || "");
    if (!range) {
      await route.fulfill({ contentType: "video/mp4", headers: { "Accept-Ranges": "bytes" }, body: fixture });
      return;
    }
    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : fixture.length - 1, fixture.length - 1);
    if (start > end || start >= fixture.length) {
      await route.fulfill({ status: 416, headers: { "Content-Range": `bytes */${fixture.length}` } });
      return;
    }
    await route.fulfill({ status: 206, contentType: "video/mp4", headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${fixture.length}` }, body: fixture.subarray(start, end + 1) });
  });
  return { requestCount: () => requests };
}

test("business hero decodes a real H.264 MP4, autoplays muted and naturally loops without controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const provider = await provideEncodedVideo(page);
  await page.goto(harness);
  const video = page.locator(".business-hero-video video");
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(2);
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.2);
  expect(await video.evaluate((element: HTMLVideoElement) => ({
    width: element.videoWidth, height: element.videoHeight, autoplay: element.autoplay,
    muted: element.muted, loop: element.loop, playsInline: element.playsInline,
    controls: element.controls, paused: element.paused, error: element.error,
  }))).toEqual({ width: 960, height: 540, autoplay: true, muted: true, loop: true, playsInline: true, controls: false, paused: false, error: null });
  expect(provider.requestCount()).toBeGreaterThan(0);

  // Observe a native time wrap. Do not seek, alter playbackRate, call play(), or
  // dispatch an event: the component's own autoplay/loop must produce it.
  await video.evaluate((element: HTMLVideoElement) => {
    let previousTime = element.currentTime;
    element.dataset.actualPlaybackLoops = "0";
    element.addEventListener("timeupdate", () => {
      if (previousTime - element.currentTime > 1) element.dataset.actualPlaybackLoops = String(Number(element.dataset.actualPlaybackLoops) + 1);
      previousTime = element.currentTime;
    });
  });
  const framesBeforeLoop = await video.evaluate((element: HTMLVideoElement) => element.getVideoPlaybackQuality().totalVideoFrames);
  await expect(video).toHaveAttribute("data-actual-playback-loops", /^[1-9]\d*$/, { timeout: 10_000 });
  expect(await video.evaluate((element: HTMLVideoElement) => element.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(framesBeforeLoop);
  expect(await video.evaluate((element: HTMLVideoElement) => element.error)).toBeNull();
  await expect(page.getByRole("region", { name: "Background video lifecycle fixture" }).getByRole("button", { includeHidden: true })).toHaveCount(0);
});

test("real hero video remains unloaded for reduced motion and returns to its still poster after playback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const provider = await provideEncodedVideo(page);
  await page.goto(harness);
  const video = page.locator(".business-hero-video video");
  const poster = page.locator(".business-hero-video .business-photo img");
  await expect(video).not.toHaveAttribute("src");
  await expect(video).toBeHidden();
  await expect.poll(() => poster.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  expect(provider.requestCount()).toBe(0);
  expect(await video.evaluate((element: HTMLVideoElement) => ({ paused: element.paused, time: element.currentTime, readyState: element.readyState }))).toEqual({ paused: true, time: 0, readyState: 0 });

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(2);
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.2);
  const requestsDuringPlayback = provider.requestCount();
  expect(requestsDuringPlayback).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(video).not.toHaveAttribute("src");
  await expect(video).toBeHidden();
  await expect(poster).toBeVisible();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => ({ paused: element.paused, time: element.currentTime, readyState: element.readyState }))).toEqual({ paused: true, time: 0, readyState: 0 });
  expect(provider.requestCount()).toBe(requestsDuringPlayback);
  expect(await video.evaluate((element: HTMLVideoElement) => element.controls)).toBe(false);
});
