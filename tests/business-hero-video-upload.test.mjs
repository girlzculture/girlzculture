import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// These tests execute the real client/server/route functions against an
// in-memory Storage/Auth/database boundary. No provider credentials or network.
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
function moduleUrl(file, dependencies = {}) {
  let code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [name, replacement] of Object.entries(dependencies)) code = code.replaceAll(`"${name}"`, `"${replacement}"`);
  return url(code);
}
const coreUrl = moduleUrl("src/lib/businessHeroVideoCore.ts");
const core = await import(coreUrl);
const protocolUrl = moduleUrl("src/lib/mediaUploadProtocol.ts");
const errorsUrl = moduleUrl("src/lib/mediaUploadErrorCore.ts");
const providerUrl = url("export function getSupabaseAdmin(){return globalThis.__businessHeroVideoFixture.admin}");
const authUrl = url(`
  export function mediaRequestId(){return crypto.randomUUID()}
  export async function authenticateMediaRequest(request){
    const token=request.headers.get('authorization');
    if(!token)throw Error('Unauthorized');
    return {id:['Bearer content-admin','Bearer former-content-admin'].includes(token)?'admin-one':'other-user'};
  }
  export async function authorizeMediaUpload(request,bucket,folder){
    globalThis.__businessHeroVideoFixture.authorizations.push({bucket,folder});
    if(!request.headers.get('authorization'))throw Error('Unauthorized');
    if(request.headers.get('authorization')!=='Bearer content-admin')throw Error('Forbidden');
    return {admin:globalThis.__businessHeroVideoFixture.admin,user:{id:'admin-one'}};
  }
  export async function prepareMediaUpload(){throw Error('Unexpected image prepare')}
  export async function verifyPreparedMediaObjects(){throw Error('Unexpected image processing')}
`);
const monitorUrl = url("export const routeMonitoringProfile=()=>({}); export const withOperationalMonitoring=(_profile,handler)=>handler;");
const failuresUrl = url("export async function monitoredRouteFailure(){return Response.json({error:'Sanitized provider failure'},{status:503})}");
const serverUrl = moduleUrl("src/lib/businessHeroVideoUploadServer.ts", {
  "@/lib/mediaUploadServer": authUrl, "@/lib/mediaUploadProtocol": protocolUrl, "@/lib/businessHeroVideoCore": coreUrl,
});
const routeDependencies = {
  "@/lib/operationalMonitoring": monitorUrl, "@/lib/platformErrors": failuresUrl,
  "@/lib/supabaseAdmin": providerUrl, "@/lib/mediaUploadServer": authUrl,
  "@/lib/mediaUploadErrorCore": errorsUrl, "@/lib/mediaUploadProtocol": protocolUrl,
  "@/lib/businessHeroVideoCore": coreUrl, "@/lib/businessHeroVideoUploadServer": serverUrl,
  "@/lib/mediaUploadProfileSnapshotCore": url("export function preparedMediaProfileSnapshot(){throw Error('Unexpected image profile')}")
};
const prepareRoute = await import(moduleUrl("src/app/api/media/upload/prepare/route.ts", routeDependencies));
const finalizeRoute = await import(moduleUrl("src/app/api/media/upload/finalize/route.ts", routeDependencies));
const client = await import(moduleUrl("src/lib/mediaUploadClient.ts", {
  "@/lib/mediaUploadProtocol": protocolUrl, "@/lib/businessHeroVideoCore": coreUrl,
  "@/lib/imageUpload": moduleUrl("src/lib/imageUpload.ts"),
  "@/lib/apiResponseClient": moduleUrl("src/lib/apiResponseClient.ts"),
  "@/lib/mediaUploadRetryCore": moduleUrl("src/lib/mediaUploadRetryCore.ts"),
  "@/lib/supabase": url("export async function reportClientOperationalFailure(){return {message:'Safe upload failure'}}"),
}));

function box(type, ...chunks) {
  const contents = Buffer.concat(chunks);
  const result = Buffer.alloc(contents.length + 8);
  result.writeUInt32BE(result.length); result.write(type, 4); contents.copy(result, 8);
  return result;
}
function fixtureMp4({ width = 1280, height = 720, seconds = 12, codec = "avc1", brand = "isom" } = {}) {
  const movieHeader = Buffer.alloc(100); movieHeader.writeUInt32BE(1000, 12); movieHeader.writeUInt32BE(seconds * 1000, 16);
  const trackHeader = Buffer.alloc(84); trackHeader.writeUInt32BE(width * 65536, 76); trackHeader.writeUInt32BE(height * 65536, 80);
  const handler = Buffer.alloc(24); handler.write("vide", 8);
  const entryHeader = Buffer.alloc(78); entryHeader.writeUInt16BE(width, 24); entryHeader.writeUInt16BE(height, 26);
  const entries = Buffer.alloc(8); entries.writeUInt32BE(1, 4);
  return Buffer.concat([
    box("ftyp", Buffer.from(`${brand}\0\0\0\0isomavc1`)),
    box("moov", box("mvhd", movieHeader), box("trak", box("tkhd", trackHeader), box("mdia", box("hdlr", handler), box("minf", box("stbl", box("stsd", entries, box(codec, entryHeader, box("avcC", Buffer.from([1, 66, 0, 30, 255, 225, 0]))))))))),
    box("mdat", Buffer.from([0, 0, 0, 1])),
  ]);
}
const sourceBytes = fixtureMp4();
const sourceFile = () => new File([sourceBytes], "hero.mp4", { type: "video/mp4" });
const requestBody = () => ({ bucket: core.BUSINESS_HERO_VIDEO_BUCKET, folder: core.BUSINESS_HERO_VIDEO_FOLDER, kind: core.BUSINESS_HERO_VIDEO_KIND, crop_metadata: {}, files: { source: { name: "hero.mp4", mime_type: "video/mp4", file_size_bytes: sourceBytes.length, width: 1280, height: 720 } }, attachment: null });
const request = (path, body, token = "content-admin") => new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

function installProvider() {
  const objects = new Map(); const sessions = new Map(); const assets = new Map();
  const state = { authorizations: [], signedUploads: 0, transfers: 0, publicWrites: 0, rpcCalls: 0, failFinalize: 0, corruptReadback: false, objects, sessions, assets };
  state.admin = {
    storage: { from(bucket) { return {
      async createSignedUploadUrl(path, options) { assert.deepEqual(options, { upsert: false }); state.signedUploads++; return { data: { token: `signed:${path}` }, error: null }; },
      async upload(path, bytes, options) { assert.equal(options.contentType, "video/mp4"); state.publicWrites++; objects.set(`${bucket}/${path}`, new Blob([bytes], { type: options.contentType })); return { error: null }; },
      async download(path) { let data = objects.get(`${bucket}/${path}`); if (state.corruptReadback && bucket === "content-media" && data) data = new Blob([new Uint8Array(data.size)], { type: "video/mp4" }); return { data, error: data ? null : { message: "fixture object absent" } }; },
      getPublicUrl(path) { return { data: { publicUrl: `https://fixture.invalid/storage/v1/object/public/${bucket}/${path}` } }; },
    }; } },
    from(table) { const rows = table === "media_upload_sessions" ? sessions : assets; let key = ""; return {
      async insert(row) { rows.set(row.id, structuredClone(row)); return { error: null }; },
      select() { return this; }, eq(_field, value) { key = value; return this; },
      async maybeSingle() { return { data: rows.get(key) || null, error: null }; },
      async single() { return { data: rows.get(key) || null, error: null }; },
    }; },
    async rpc(name, args) {
      assert.equal(name, "finalize_media_upload_session"); state.rpcCalls++;
      if (state.failFinalize-- > 0) return { error: { message: "fixture transaction unavailable" } };
      const session = sessions.get(args.p_session_id); const verified = args.p_verified_objects;
      assert.equal(verified.source.path, session.expected_objects.source.path);
      assert.equal(verified.renditions.desktop.path, session.expected_objects.desktop.path);
      const id = randomUUID(); const asset = { id, public_url: verified.renditions.desktop.url, status: "Staged", media_kind: session.media_kind, verified };
      assets.set(id, asset); session.status = "Finalized"; session.finalized_asset_id = id;
      return { data: { asset_id: id, url: asset.public_url, attached: false, status: asset.status }, error: null };
    },
  };
  globalThis.__businessHeroVideoFixture = state;
  const transport = { storage: { from(bucket) { return { async uploadToSignedUrl(path, token, file, options) {
    assert.equal(token, `signed:${path}`); assert.equal(options.contentType, "video/mp4"); state.transfers++;
    objects.set(`${bucket}/${path}`, new Blob([file], { type: options.contentType })); return { error: null };
  } }; } } };
  return { state, transport };
}

await test("MP4 validation derives bounded metadata from real container fields", async () => {
  assert.deepEqual(core.inspectBusinessHeroMp4(sourceBytes), { width: 1280, height: 720, durationSeconds: 12, mimeType: "video/mp4" });
  const normalized = await core.normalizeBusinessHeroVideo(new File([sourceBytes], "phone-export.bin", { type: "application/octet-stream" }));
  assert.equal(normalized.file.type, "video/mp4"); assert.equal(normalized.file.name, "phone-export.mp4");
  assert.deepEqual(new Uint8Array(await normalized.file.arrayBuffer()), new Uint8Array(sourceBytes));
});

await test("malformed MIME, size, container, codec and duration are rejected", async () => {
  for (const bytes of [Buffer.from("<script>video</script>"), sourceBytes.subarray(0, 30), fixtureMp4({ brand: "avif" }), fixtureMp4({ codec: "hvc1" }), fixtureMp4({ seconds: 121 }), fixtureMp4({ seconds: 0 }), Buffer.alloc(core.BUSINESS_HERO_VIDEO_MAX_BYTES + 1)]) {
    assert.throws(() => core.inspectBusinessHeroMp4(bytes), core.BusinessHeroVideoValidationError);
  }
  const invalidSize = Buffer.from(sourceBytes); invalidSize.writeUInt32BE(4);
  assert.throws(() => core.inspectBusinessHeroMp4(invalidSize), core.BusinessHeroVideoValidationError);
  await assert.rejects(core.normalizeBusinessHeroVideo(new File([sourceBytes], "renamed.mp4", { type: "image/png" })), core.BusinessHeroVideoValidationError);
});

await test("prepare requires content-admin authorization and the exact business scope", async () => {
  const { state } = installProvider();
  for (const [token, status] of [["", 401], ["customer", 403], ["admin-without-content", 403]]) {
    assert.equal((await prepareRoute.POST(request("/api/media/upload/prepare", requestBody(), token))).status, status);
  }
  for (const mutation of [{ bucket: "salon-photos" }, { folder: "other" }, { attachment: { record_type: "salon" } }]) {
    assert.equal((await prepareRoute.POST(request("/api/media/upload/prepare", { ...requestBody(), ...mutation }))).status, 400);
  }
  const badMime = requestBody(); badMime.files.source.mime_type = "image/png";
  assert.equal((await prepareRoute.POST(request("/api/media/upload/prepare", badMime))).status, 400);
  const oversized = requestBody(); oversized.files.source.file_size_bytes = core.BUSINESS_HERO_VIDEO_MAX_BYTES + 1;
  assert.equal((await prepareRoute.POST(request("/api/media/upload/prepare", oversized))).status, 400);
  assert.equal(state.signedUploads, 0); assert.equal(state.sessions.size, 0);
  const prepared = await prepareRoute.POST(request("/api/media/upload/prepare", requestBody()));
  assert.equal(prepared.status, 200); const body = await prepared.json();
  assert.equal(body.uploads.length, 1); assert.equal(body.uploads[0].bucket, "media-originals");
  assert.equal(body.uploads[0].mime_type, "video/mp4"); assert.equal(state.sessions.size, 1);
});

await test("real transport and finalize share one registry record with authoritative metadata", async () => {
  const { state, transport } = installProvider(); const priorFetch = globalThis.fetch;
  globalThis.fetch = async (path, options) => {
    const incoming = new Request(`http://localhost${path}`, options);
    return path.endsWith("prepare") ? prepareRoute.POST(incoming) : finalizeRoute.POST(incoming);
  };
  try {
    const result = await client.directBusinessHeroVideoUpload({ client: transport, session: { access_token: "content-admin" }, source: sourceFile() });
    assert.equal(result.attached, false); assert.equal(state.transfers, 1); assert.equal(state.assets.size, 1);
    const asset = state.assets.get(result.assetId); const rendition = asset.verified.renditions.desktop;
    assert.deepEqual({ mime: rendition.mime_type, bytes: rendition.file_size_bytes, width: rendition.width, height: rendition.height, seconds: rendition.duration_seconds, checksum: rendition.checksum_sha256 }, { mime: "video/mp4", bytes: sourceBytes.length, width: 1280, height: 720, seconds: 12, checksum: createHash("sha256").update(sourceBytes).digest("hex") });
    assert.equal(asset.media_kind, core.BUSINESS_HERO_VIDEO_KIND); assert.equal(Object.keys(asset.verified.renditions).length, 1);
    const replay = await finalizeRoute.POST(request("/api/media/upload/finalize", { upload_id: result.uploadId }));
    assert.equal(replay.status, 200); assert.equal((await replay.json()).asset_id, result.assetId);
    assert.equal(state.rpcCalls, 1); assert.equal(state.publicWrites, 1);
    const otherOwner = await finalizeRoute.POST(request("/api/media/upload/finalize", { upload_id: result.uploadId }, "customer"));
    assert.equal(otherOwner.status, 403); assert.equal(state.assets.size, 1);
    const revokedOwner = await finalizeRoute.POST(request("/api/media/upload/finalize", { upload_id: result.uploadId }, "former-content-admin"));
    assert.equal(revokedOwner.status, 403); assert.equal(state.assets.size, 1);
  } finally { globalThis.fetch = priorFetch; }
});

await test("interrupted finalization retries the same source without a second transfer", async () => {
  const { state, transport } = installProvider(); state.failFinalize = 1; const priorFetch = globalThis.fetch;
  globalThis.fetch = async (path, options) => {
    const incoming = new Request(`http://localhost${path}`, options);
    return path.endsWith("prepare") ? prepareRoute.POST(incoming) : finalizeRoute.POST(incoming);
  };
  try {
    const pending = [];
    const result = await client.directBusinessHeroVideoUpload({ client: transport, session: { access_token: "content-admin" }, source: sourceFile(), onFinalizePending: id => pending.push(id) });
    assert.equal(state.transfers, 1); assert.equal(state.signedUploads, 1); assert.equal(state.rpcCalls, 2); assert.equal(state.assets.size, 1);
    assert.deepEqual(pending, [result.uploadId, null]);
    const resumed = await client.directBusinessHeroVideoUpload({ client: transport, session: { access_token: "content-admin" }, source: sourceFile(), resumeUploadId: result.uploadId });
    assert.equal(resumed.assetId, result.assetId); assert.equal(state.transfers, 1); assert.equal(state.signedUploads, 1);
  } finally { globalThis.fetch = priorFetch; }
});

await test("finalize rejects spoofed source bytes and failed storage readback", async () => {
  for (const scenario of ["mime", "bytes", "readback"]) {
    const { state } = installProvider();
    const prepared = await (await prepareRoute.POST(request("/api/media/upload/prepare", requestBody()))).json();
    const original = prepared.uploads[0];
    state.objects.set(`${original.bucket}/${original.path}`, new Blob([scenario === "bytes" ? Buffer.alloc(sourceBytes.length) : sourceBytes], { type: scenario === "mime" ? "text/html" : "video/mp4" }));
    state.corruptReadback = scenario === "readback";
    const response = await finalizeRoute.POST(request("/api/media/upload/finalize", { upload_id: prepared.upload_id }));
    assert.equal(response.status, scenario === "readback" ? 503 : 400); assert.equal(state.assets.size, 0); assert.equal(state.rpcCalls, 0);
    if (scenario !== "readback") assert.equal(state.publicWrites, 0);
  }
});

delete globalThis.__businessHeroVideoFixture;
