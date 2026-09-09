import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("Next image optimization returns a decodable resized image after the security upgrade", async ({ request }) => {
  const response = await request.get("/_next/image", {
    params: { url: "/images/hero-braids.jpg", w: "640", q: "75" },
    headers: { accept: "image/webp" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/webp");
  const metadata = await sharp(await response.body()).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.width).toBe(640);
  expect(metadata.height).toBeGreaterThan(0);
});

test("Next image optimization still rejects unapproved widths and external sources", async ({ request }) => {
  for (const params of [
    { url: "/images/hero-braids.jpg", w: "13", q: "75" },
    { url: "https://example.invalid/image.jpg", w: "640", q: "75" },
  ]) {
    const response = await request.get("/_next/image", { params });
    expect(response.status()).toBe(400);
  }
});
