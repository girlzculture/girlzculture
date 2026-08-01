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

const animatedGifFixture = Buffer.from(
  "R0lGODlhkAHhAPAAAACKhgAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACH/C0ltYWdlTWFnaWNrDmdhbW1hPTAuNDU0NTQ1ACwAAAAAkAHhAAAC/4SPqcvtD6OctNqLs968+w+G4kiW5omm6sq27gvH8kzX9o3n+s73/g8MCofEovGITCqXzKbzCY1Kp9Sq9YrNarfcrvcLDovH5LL5jE6r1+y2+w2Py+f0uv2Oz+v3/L7/DxgoOEhYaHiImKi4yNjo+AgZKTlJWWl5iZmpucnZ6fkJGio6SlpqeoqaqrrK2ur6ChsrO0tba3uLm6u7y9vr+wscLDxMXGx8jJysvMzc7PwMHS09TV1tfY2drb3N3e39DR4uPk5ebn6Onq6+zt7u/g4fLz9PX29/j5+vv8/f7/8PMKDAgQQLGjyIMKHChQwbOnwIMaLEiRQrWryIMaPGjaUcO3r8CDKkyJEkS5o8iTKlypUsW7p8CTOmzJk0a9q8iTOnzp08e/r8CTSo0KFEixo9ijSp0qVMmzp9CjWq1KlUq1q9ijWr1q1cu3r9Cjas2LFky5o9izat2rVs27p9Czeu3Ll069q9izev3r18+/r9Cziw4MGECxs+jDix4sWMGzt+DDmy5MmUK1u+jDmz5s2cO3v+DDq06NGkS5s+jTq16tVICwAAIfkEAAoAAAAh/wtJbWFnZU1hZ2ljaw5nYW1tYT0wLjQ1NDU0NQAsAAAAAJAB4QCA/2hoAAAAAv+Ej6nL7Q+jnLTai7PevPsPhuJIluaJpurKtu4Lx/JM1/aN5/rO9/4PDAqHxKLxiEwql8ym8wmNSqfUqvWKzWq33K73Cw6Lx+Sy+YxOq9fstvsNj8vn9Lr9js/r9/y+/w8YKDhIWGh4iJiouMjY6PgIGSk5SVlpeYmZqbnJ2en5CRoqOkpaanqKmqq6ytrq+gobKztLW2t7i5uru8vb6/sLHCw8TFxsfIycrLzM3Oz8DB0tPU1dbX2Nna29zd3t/Q0eLj5OXm5+jp6uvs7e7v4OHy8/T19vf4+fr7/P3+//DzCgwIEECxo8iDChwoUMGzp8CDGixIkUK1q8iDGjxo2lHDt6/AgypMiRJEuaPIkypcqVLFu6fAkzpsyZNGvavIkzp86dPHv6/Ak0qNChRIsaPYo0qdKlTJs6fQo1qtSpVKtavYo1q9atXLt6/Qo2rNixZMuaPYs2rdq1bNu6fQs3rty5dOvavYs3r969fPv6/Qs4sODBhAsbPow4seLFjBs7fgw5suTJlCtbvow5s+bNnDt7/gw6tOjRpEubPo06terVSAsAACH5BAAKAAAAIf8LSW1hZ2VNYWdpY2sOZ2FtbWE9MC40NTQ1NDUALAAAAACQAeEAgA0RFAAAAAL/hI+py+0Po5y02ouz3rz7D4biSJbmiabqyrbuC8fyTNf2jef6zvf+DwwKh8Si8YhMKpfMpvMJjUqn1Kr1is1qt9yu9wsOi8fksvmMTqvX7Lb7DY/L5/S6/Y7P6/f8vv8PGCg4SFhoeIiYqLjI2Oj4CBkpOUlZaXmJmam5ydnp+QkaKjpKWmp6ipqqusra6voKGys7S1tre4ubq7vL2+v7CxwsPExcbHyMnKy8zNzs/AwdLT1NXW19jZ2tvc3d7f0NHi4+Tl5ufo6err7O3u7+Dh8vP09fb3+Pn6+/z9/v/w8woMCBBAsaPIgwocKFDBs6fAgxosSJFCtavIgxo8aNpRw7evwIMqTIkSRLmjyJMqXKlSxbunwJM6bMmTRr2ryJM6fOnTx7+vwJNKjQoUSLGj2KNKnSpUybOn0KNarUqVSrWr2KNavWrVy7ev0KNqzYsWTLmj2LNq3atWzbun0LN67cuXTr2r2LN6/evXz7+v0LOLDgwYQLGz6MOLHixYwbO34MObLkyZQrW76MObPmzZw7e/4MOrTo0aRLmz6NOrXq1UgLAAA7",
  "base64",
);
const animatedSource = await processor.inspectCanonicalMediaSource(
  animatedGifFixture,
  "image/gif",
);
assert.equal(animatedSource.mimeType, "image/gif");
assert.equal(animatedSource.width, 400);
assert.equal(
  animatedSource.height,
  225,
  "animated source dimensions use one frame rather than the stacked animation height",
);
const animatedTarget = processor.animatedRenditionDimensions({
  source: { width: 400, height: 225 },
  target: { width: 1920, height: 1080 },
  maximumLongEdge: 960,
});
assert.deepEqual(animatedTarget, { width: 400, height: 225 });
const animatedOutput = await processor.createCanonicalMediaRendition({
  source: animatedSource,
  target: animatedTarget,
  transform: { zoom: 1, positionX: 0, positionY: 0, rotation: 0 },
  quality: 88,
  maximumBytes: 4 * 1024 * 1024,
});
const animatedMetadata = await sharp(animatedOutput.buffer, {
  animated: true,
}).metadata();
assert.equal(animatedOutput.mimeType, "image/gif");
assert.equal(animatedMetadata.pages, 3, "responsive GIF remains animated");
assert.equal(animatedMetadata.width, 400);
assert.equal(animatedMetadata.pageHeight, 225);
assert.ok(animatedOutput.buffer.length <= 4 * 1024 * 1024);

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
  "Verified real Sharp pixel buffers, animated GIF preservation without destructive upscaling, Engine output quality, placement-independent source acceptance, EXIF auto-orientation, focal edge preservation, transparent-logo rotation, and exact desktop/tablet/mobile/thumbnail outputs.",
);
