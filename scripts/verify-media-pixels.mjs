import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import ts from "typescript";

const require = createRequire(import.meta.url);

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

async function loadActualProcessor() {
  const imageUploadUrl = dataModule(
    transpile(fs.readFileSync("src/lib/imageUpload.ts", "utf8")),
  );
  const processingCoreUrl = dataModule(
    transpile(fs.readFileSync("src/lib/mediaImageProcessingCore.ts", "utf8")),
  );
  const sharpUrl = pathToFileURL(require.resolve("sharp")).href;
  const processorSource = fs
    .readFileSync("src/lib/mediaImageProcessor.ts", "utf8")
    .replace('import "server-only";', "")
    .replace('from "sharp";', `from "${sharpUrl}";`)
    .replace(
      'from "@/lib/imageUpload";',
      `from "${imageUploadUrl}";`,
    )
    .replace(
      'from "@/lib/mediaImageProcessingCore";',
      `from "${processingCoreUrl}";`,
    );
  return import(dataModule(transpile(processorSource)));
}

async function fixture(width, height, background) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background,
    },
  })
    .png()
    .toBuffer();
}

const processor = await loadActualProcessor();

for (const [width, height] of [
  [1200, 525],
  [800, 600],
  [1200, 600],
  [1600, 1200],
  [1080, 1920],
  [1920, 1080],
]) {
  const source = await processor.inspectCanonicalMediaSource(
    await fixture(width, height, "#d6186b"),
    "image/png",
  );
  assert.equal(source.width, width);
  assert.equal(source.height, height);
  assert.ok(source.normalizedBuffer.length > 0);
}

const orientedJpeg = await sharp({
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
        '<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="1200" height="150" fill="#d6186b"/><text x="250" y="500" font-family="Arial" font-size="100">UPRIGHT</text></svg>',
      ),
    },
  ])
  .jpeg({ quality: 92 })
  .withMetadata({ orientation: 6 })
  .toBuffer();
const orientedSource = await processor.inspectCanonicalMediaSource(
  orientedJpeg,
  "image/jpeg",
);
assert.deepEqual(
  { width: orientedSource.width, height: orientedSource.height },
  { width: 800, height: 1200 },
);
const normalizedMetadata = await sharp(orientedSource.normalizedBuffer).metadata();
assert.deepEqual(
  {
    width: normalizedMetadata.width,
    height: normalizedMetadata.height,
    orientation: normalizedMetadata.orientation,
  },
  { width: 800, height: 1200, orientation: undefined },
);

const edgeSvg = Buffer.from(`
  <svg width="1600" height="1200" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1200" fill="#f7dfd4"/>
    <rect x="0" width="360" height="1200" fill="#e11d48"/>
    <rect x="1240" width="360" height="1200" fill="#1d4ed8"/>
    <text x="25" y="150" fill="white" font-family="Arial" font-size="68">LEFT TEXT</text>
    <text x="1255" y="1100" fill="white" font-family="Arial" font-size="58">RIGHT TEXT</text>
  </svg>
`);
const edgeSource = await processor.inspectCanonicalMediaSource(
  await sharp(edgeSvg).png().toBuffer(),
  "image/png",
);
const targets = {
  desktop: { width: 1920, height: 840 },
  tablet: { width: 1440, height: 1080 },
  mobile: { width: 1080, height: 1920 },
  thumbnail: { width: 480, height: 360 },
};
const outputs = {};
for (const [slot, target] of Object.entries(targets)) {
  const output = await processor.createCanonicalMediaRendition({
    source: edgeSource,
    target,
    transform: {
      zoom: 1,
      positionX: slot === "mobile" ? 100 : 0,
      positionY: 0,
      rotation: 0,
    },
    quality: 88,
    maximumBytes: 4 * 1024 * 1024,
  });
  const metadata = await sharp(output.buffer).metadata();
  assert.equal(metadata.width, target.width, `${slot} width`);
  assert.equal(metadata.height, target.height, `${slot} height`);
  assert.ok(output.buffer.length <= 4 * 1024 * 1024, `${slot} byte ceiling`);
  assert.match(output.checksum, /^[a-f0-9]{64}$/);
  outputs[slot] = output;
}

const leftFocused = await processor.createCanonicalMediaRendition({
  source: edgeSource,
  target: targets.thumbnail,
  transform: { zoom: 2, positionX: -100, positionY: 0, rotation: 0 },
  quality: 90,
  maximumBytes: 4 * 1024 * 1024,
});
const rightFocused = await processor.createCanonicalMediaRendition({
  source: edgeSource,
  target: targets.thumbnail,
  transform: { zoom: 2, positionX: 100, positionY: 0, rotation: 0 },
  quality: 90,
  maximumBytes: 4 * 1024 * 1024,
});
const [leftStats, rightStats] = await Promise.all([
  sharp(leftFocused.buffer).stats(),
  sharp(rightFocused.buffer).stats(),
]);
assert.ok(
  leftStats.channels[0].mean > leftStats.channels[2].mean,
  "left focal crop retains the red edge marker",
);
assert.ok(
  rightStats.channels[2].mean > rightStats.channels[0].mean,
  "right focal crop retains the blue edge marker",
);

const jpegEdgeSource = await processor.inspectCanonicalMediaSource(
  await sharp(edgeSvg).jpeg({ quality: 96 }).toBuffer(),
  "image/jpeg",
);
const quality96 = await processor.createCanonicalMediaRendition({
  source: jpegEdgeSource,
  target: targets.thumbnail,
  transform: { zoom: 1, positionX: 0, positionY: 0, rotation: 0 },
  quality: 96,
  maximumBytes: 4 * 1024 * 1024,
});
const quality100 = await processor.createCanonicalMediaRendition({
  source: jpegEdgeSource,
  target: targets.thumbnail,
  transform: { zoom: 1, positionX: 0, positionY: 0, rotation: 0 },
  quality: 100,
  maximumBytes: 4 * 1024 * 1024,
});
assert.notEqual(
  quality100.checksum,
  quality96.checksum,
  "Engine quality 100 must reach Sharp instead of being silently capped at 96",
);

const wrongMimeFixture = await fixture(1200, 600, "#5b1a6b");
await assert.rejects(
  () =>
    processor.inspectCanonicalMediaSource(wrongMimeFixture, "image/jpeg"),
  /format does not match/i,
);

const transparentLogoBuffer = await sharp({
  create: {
    width: 900,
    height: 900,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    {
      input: Buffer.from(
        '<svg width="900" height="900" xmlns="http://www.w3.org/2000/svg"><circle cx="450" cy="450" r="300" fill="#5B1A6B"/></svg>',
      ),
    },
  ])
  .png()
  .toBuffer();
const transparentLogo = await processor.inspectCanonicalMediaSource(
  transparentLogoBuffer,
  "image/png",
);
const rotatedLogo = await processor.createCanonicalMediaRendition({
  source: transparentLogo,
  target: { width: 900, height: 900 },
  transform: { rotation: 90 },
  quality: 88,
  maximumBytes: 4 * 1024 * 1024,
});
assert.equal(
  (await sharp(rotatedLogo.buffer).metadata()).hasAlpha,
  true,
  "rotating a transparent PNG logo must preserve its alpha channel",
);

console.log(
  "Verified real Sharp pixel buffers, Engine output quality, placement-independent source acceptance, EXIF auto-orientation, focal edge preservation, transparent-logo rotation, and exact desktop/tablet/mobile/thumbnail outputs.",
);
