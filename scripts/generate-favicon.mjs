// Technical conversion of the approved artwork; no cropping or visual edits.
// Reproduce: node scripts/generate-favicon.mjs
// Verify committed assets without writing: node scripts/generate-favicon.mjs --check
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const sourceHash = "e126237f476a8d5e82b495db754961c090bbfb57c1ed692bd42ae301d5f6d4bd";
const sourceName = `girlz-culture-favicon-source.${sourceHash.slice(0, 16)}.png`;
const directory = new URL("../public/brand/", import.meta.url);
const sizes = [16, 32, 48, 64, 256];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 1 && args[0] === "--check"), "Usage: node scripts/generate-favicon.mjs [--check]");
const check = args[0] === "--check";

const source = await readFile(new URL(sourceName, directory));
assert.equal(sha256(source), sourceHash, "The approved original must remain byte-for-byte unchanged");
const metadata = await sharp(source).metadata();
assert.equal(metadata.format, "png");
assert.equal(metadata.width, 1254);
assert.equal(metadata.height, 1254);
assert.equal(metadata.space, "srgb");
assert.equal(metadata.hasAlpha, false);
assert.equal(metadata.hasProfile, false);

const frames = await Promise.all(sizes.map(async (size) => {
  // A square source is resized in full. Adding opaque alpha makes the PNG
  // frames explicitly 32-bit without changing any visible source color.
  const pipeline = sharp(source)
    .resize(size, size, { fit: "inside", kernel: "lanczos3", withoutEnlargement: true })
    .ensureAlpha();
  const expectedPixels = await pipeline.clone().raw().toBuffer();
  const png = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
  assert.deepEqual(await sharp(png).raw().toBuffer(), expectedPixels, `PNG pixels must equal the full-image ${size}px downsample`);
  return { size, png, expectedPixels };
}));

// ICO header plus one 16-byte directory entry per PNG frame. A zero dimension
// byte represents 256 pixels; planes=1 and bitCount=32 match the RGBA frames.
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach(({ size, png }, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(size === 256 ? 0 : size, entry);
  header.writeUInt8(size === 256 ? 0 : size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
const ico = Buffer.concat([header, ...frames.map(({ png }) => png)]);

// Re-read the actual container offsets and independently decode every embedded
// frame, so an incorrect directory or pixel transformation fails generation.
assert.equal(ico.readUInt16LE(0), 0);
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), sizes.length);
let nextOffset = header.length;
for (const [index, { size, png, expectedPixels }] of frames.entries()) {
  const entry = 6 + index * 16;
  assert.equal(ico[entry] || 256, size);
  assert.equal(ico[entry + 1] || 256, size);
  assert.equal(ico.readUInt32LE(entry + 12), nextOffset);
  const length = ico.readUInt32LE(entry + 8);
  const embedded = ico.subarray(nextOffset, nextOffset + length);
  assert.deepEqual(embedded, png, `${size}px embedded PNG bytes must match`);
  const decoded = await sharp(embedded).raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, size);
  assert.equal(decoded.info.height, size);
  assert.equal(decoded.info.channels, 4);
  assert.deepEqual(decoded.data, expectedPixels, `${size}px ICO pixels must match the source downsample`);
  nextOffset += length;
}
assert.equal(nextOffset, ico.length);

const icoHash = sha256(ico);
const icoName = `girlz-culture-favicon.${icoHash.slice(0, 16)}.ico`;
const provenance = `${JSON.stringify({
  schemaVersion: 1,
  source: { file: sourceName, sha256: sourceHash, width: metadata.width, height: metadata.height, origin: "User-supplied ChatGPT Image Sep 11, 2026, 05_55_27 PM.png", preservedOriginalBytes: true },
  conversion: { operation: "Full-image Lanczos3 downsample; lossless PNG RGBA frames in ICO; no crop, redraw or recolor", sharp: sharp.versions.sharp, libvips: sharp.versions.vips, png: sharp.versions.png, compressionLevel: 9, adaptiveFiltering: false, palette: false },
  output: { file: icoName, sha256: icoHash, bytes: ico.length, frames: frames.map(({ size, png }) => ({ width: size, height: size, pngSha256: sha256(png), bytes: png.length })) },
  reproduce: "node scripts/generate-favicon.mjs",
  verify: "node scripts/generate-favicon.mjs --check",
}, null, 2)}\n`;
for (const [name, bytes] of [[icoName, ico], ["favicon-provenance.json", Buffer.from(provenance)]]) {
  const path = new URL(name, directory);
  if (check) assert.deepEqual(await readFile(path), bytes, `Committed ${name} must match deterministic generation`);
  else await writeFile(path, bytes);
}
console.log(JSON.stringify({ status: check ? "verified" : "generated", sourceSha256: sourceHash, icoSha256: icoHash, icoPath: fileURLToPath(new URL(icoName, directory)), sizes }));
