import { expect, test, type Browser } from "@playwright/test";
import sharp from "sharp";

test.describe.configure({ mode: "serial" });

type Fixture = {
  name: string;
  mimeType: "image/png" | "image/jpeg";
  buffer: Buffer;
};

async function solidPng(
  name: string,
  width: number,
  height: number,
  color: string,
): Promise<Fixture> {
  return {
    name,
    mimeType: "image/png",
    buffer: await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: color,
      },
    })
      .png()
      .toBuffer(),
  };
}

async function requiredFixtures(): Promise<Fixture[]> {
  const edgeSvg = Buffer.from(`
    <svg width="1200" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="600" fill="#f7dfd4"/>
      <rect x="0" y="0" width="60" height="600" fill="#d6186b"/>
      <rect x="1140" y="0" width="60" height="600" fill="#5b1a6b"/>
      <text x="12" y="55" font-family="Arial" font-size="30" fill="white">LEFT</text>
      <text x="1080" y="560" font-family="Arial" font-size="30" fill="white">RIGHT</text>
      <text x="330" y="320" font-family="Arial" font-size="62" fill="#1a1220">KEEP IMPORTANT TEXT</text>
    </svg>
  `);
  const exifBase = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: "#e0a34e",
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg"><text x="100" y="420" font-family="Arial" font-size="90">ORIENTED</text></svg>`,
        ),
      },
    ])
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  return [
    await solidPng("source-1200x525.png", 1200, 525, "#d6186b"),
    await solidPng("source-800x600.png", 800, 600, "#5b1a6b"),
    await solidPng("source-1200x600.png", 1200, 600, "#e0a34e"),
    await solidPng("source-1600x1200.png", 1600, 1200, "#1a1220"),
    await solidPng("phone-portrait-1080x1920.png", 1080, 1920, "#f3d9e4"),
    await solidPng("phone-landscape-1920x1080.png", 1920, 1080, "#fbf4ee"),
    {
      name: "important-text-at-edges.png",
      mimeType: "image/png",
      buffer: await sharp(edgeSvg).png().toBuffer(),
    },
    {
      name: "exif-orientation-6.jpg",
      mimeType: "image/jpeg",
      buffer: exifBase,
    },
  ];
}

async function cropAtDpr(
  browser: Browser,
  baseURL: string,
  deviceScaleFactor: number,
  fixture: Fixture,
) {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 800 },
    deviceScaleFactor,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/internal/acceptance/media-upload`);
    await page.getByLabel("Real image files").setInputFiles(fixture);
    await expect(page.getByTestId("browser-image-result")).toHaveAttribute(
      "data-accepted",
      "true",
    );
    return {
      output: await page
        .getByTestId("canonical-output")
        .getAttribute("data-output-dimensions"),
      crop: await page
        .getByTestId("canonical-output")
        .getAttribute("data-crop-region"),
    };
  } finally {
    await context.close();
  }
}

test("real browser Files and Blobs accept every required source for every placement", async ({
  page,
  browserName,
}) => {
  test.setTimeout(90_000);
  test.skip(browserName !== "chromium", "Chromium exercises the image decoder contract.");
  const fixtures = await requiredFixtures();
  await page.goto("/internal/acceptance/media-upload");
  await page.getByLabel("Real image files").setInputFiles(fixtures);

  const rows = page.getByTestId("browser-image-result");
  await expect(rows).toHaveCount(fixtures.length, { timeout: 30_000 });
  for (const fixture of fixtures) {
    const row = rows.filter({ hasText: fixture.name });
    await expect(row).toHaveAttribute("data-accepted", "true");
    await expect(row).toHaveAttribute("data-blob-verified", "true");
    await expect(row).toHaveAttribute(
      "data-accepted-placements",
      "logo,cover,gallery,avatar,service,product,review,content",
    );
    const preview = row.getByRole("img", {
      name: `Crop preview for ${fixture.name}`,
    });
    await expect(preview).toBeVisible();
    expect(
      await preview.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
  }

  const exif = rows.filter({ hasText: "exif-orientation-6.jpg" });
  await expect(exif).toHaveAttribute(
    "data-source-dimensions",
    "800x1200",
  );

  await page.getByLabel("Preview placement").selectOption("cover");
  for (const [device, expected] of [
    ["desktop", "1920x840"],
    ["tablet", "1440x1080"],
    ["mobile", "1080x1920"],
  ] as const) {
    await page.getByLabel("Preview device").selectOption(device);
    await expect(page.getByTestId("canonical-output")).toHaveAttribute(
      "data-output-dimensions",
      expected,
    );
  }
});

test("canonical crop math is invariant across browser DPR", async ({
  browser,
  browserName,
  baseURL,
}) => {
  test.skip(browserName !== "chromium", "One browser is sufficient for deterministic crop math.");
  const fixture = (await requiredFixtures()).find(
    (row) => row.name === "source-1200x600.png",
  )!;
  const url = String(baseURL || "http://127.0.0.1:3104");
  const [dprOne, dprThree] = await Promise.all([
    cropAtDpr(browser, url, 1, fixture),
    cropAtDpr(browser, url, 3, fixture),
  ]);
  expect(dprThree).toEqual(dprOne);
});

test("one failed real File does not remove successful multi-file outcomes", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium exercises the queue contract.");
  const [first, middle, last] = await Promise.all([
    solidPng("first-success.png", 1200, 600, "#d6186b"),
    solidPng("partial-failure.png", 800, 600, "#5b1a6b"),
    solidPng("last-success.png", 1600, 1200, "#e0a34e"),
  ]);
  await page.goto("/internal/acceptance/media-upload");
  await page.getByLabel("Real image files").setInputFiles([
    first,
    middle,
    last,
  ]);
  await page.getByRole("button", {
    name: "Run isolated multi-file outcomes",
  }).click();
  await expect(page.getByTestId("queue-summary")).toHaveText(
    "2 complete, 1 failed",
  );
  await expect(
    page.getByTestId("browser-image-result").filter({ hasText: first.name }),
  ).toHaveAttribute("data-queue-status", "complete");
  await expect(
    page.getByTestId("browser-image-result").filter({ hasText: middle.name }),
  ).toHaveAttribute("data-queue-status", "error");
  await expect(
    page.getByTestId("browser-image-result").filter({ hasText: last.name }),
  ).toHaveAttribute("data-queue-status", "complete");
  await expect(page.getByTestId("browser-image-result")).toHaveCount(3);
});
