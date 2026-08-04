import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
const protocolSource = read("src/lib/mediaUploadProtocol.ts");
const clientSource = read("src/lib/mediaUploadClient.ts");
const serverSource = read("src/lib/mediaUploadServer.ts");

const transpiledProtocol = ts.transpileModule(protocolSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const protocol = await import(
  `data:text/javascript;base64,${Buffer.from(transpiledProtocol).toString("base64")}`
);

assert.deepEqual(
  [...protocol.MEDIA_DIRECT_UPLOAD_SLOTS],
  ["source"],
  "the browser contract must upload exactly one untouched source object",
);
assert.equal(protocol.isCanonicalDirectUploadPlan(["source"]), true);
for (const invalid of [
  [],
  ["desktop"],
  ["source", "desktop"],
  ["source", "tablet", "mobile"],
]) {
  assert.equal(
    protocol.isCanonicalDirectUploadPlan(invalid),
    false,
    `the client must reject incompatible signed-upload slots: ${invalid.join(",")}`,
  );
}

assert.match(
  clientSource,
  /isCanonicalDirectUploadPlan\(\s*prepareBody\.uploads\.map/,
  "the browser must reject a server response that asks it to upload derivatives",
);
assert.match(
  clientSource,
  /const uploadFiles: UploadFiles = \{ source: input\.source \}/,
  "the browser must retain only the selected source file",
);
assert.match(
  serverSource,
  /const requiredSlots: MediaUploadSlot\[\] = \[\s*"source",\s*\.\.\.MEDIA_RENDITION_SLOTS/,
  "the prepared session must declare source plus every canonical derivative",
);
assert.match(
  serverSource,
  /for \(const slot of MEDIA_DIRECT_UPLOAD_SLOTS\)[\s\S]*?createSignedUploadUrl/,
  "prepare must sign only the shared browser-upload slot contract",
);
assert.match(
  serverSource,
  /createCanonicalMediaRendition\([\s\S]*?\.upload\(target\.path, uploadBytes/,
  "finalize must generate and upload derivatives on the trusted server",
);
assert.doesNotMatch(
  serverSource.slice(
    serverSource.indexOf("export async function prepareMediaUpload"),
    serverSource.indexOf("function expectedObjects"),
  ),
  /descriptor\(body\.files\?\.\[(?:slot|.+?)\]/,
  "prepare must never require browser-supplied derivative descriptors",
);

console.log(
  "Verified the source-only browser upload contract, full prepared rendition plan, client protocol guard, and server-side canonical derivative generation.",
);
