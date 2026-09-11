import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { DEFAULT_FAVICON_HREF, getPublishedFaviconHref } from "../src/lib/brandFavicon.ts";

test("missing, unpublished and malformed Engine values use the fixed approved fallback", () => {
  for (const asset of [undefined, null, {}, { published_url: "/images/icon.png" },
    ...[0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1"].map(published_version => ({ published_url: "/images/icon.png", published_version })),
    { published_url: "", published_version: 1 }, { published_url: " /images/icon.png", published_version: 1 },
  ]) assert.equal(getPublishedFaviconHref(asset), DEFAULT_FAVICON_HREF);
});

test("published versions replace old cache keys without discarding other query values or SVG fragments", () => {
  const asset = { published_url: "/images/icon.svg?v=1760000000000&size=64&size=32&v=old#brand", published_version: 7 };
  const result = new URL(getPublishedFaviconHref(asset), "https://site.invalid");
  assert.deepEqual(result.searchParams.getAll("v"), ["7"]);
  assert.deepEqual(result.searchParams.getAll("size"), ["64", "32"]);
  assert.equal(result.hash, "#brand");
  assert.equal(getPublishedFaviconHref(asset), getPublishedFaviconHref(asset));
  assert.equal(getPublishedFaviconHref({ ...asset, published_version: 8 }), "/images/icon.svg?v=8&size=64&size=32#brand");
});

test("publishing and restoring the same binary both select the new publication version", () => {
  const source = "/images/brand/approved.png";
  assert.equal(getPublishedFaviconHref({ published_url: source, published_version: 1 }), `${source}?v=1`);
  assert.equal(getPublishedFaviconHref({ published_url: `${source}?v=1`, published_version: 2 }), `${source}?v=2`);
  assert.equal(getPublishedFaviconHref({ published_url: `${source}?v=1`, published_version: 3 }), `${source}?v=3`);
});

test("unsafe destinations and implicit-route redirect loops fall back safely", () => {
  for (const published_url of [
    "javascript:alert(1)", "data:image/png;base64,AA", "//evil.invalid/icon.png", "/%2fevil.invalid/icon.png",
    "/\\evil.invalid/icon.png", "/%5cevil.invalid/icon.png", "/images/%0aicon.png", "/images/%ZZ.png",
    "/favicon.ico", "/favicon.ico?v=3", "/images/../favicon.ico", "/%66avicon.ico", "/account", "/images/icon.html",
    "/images/..//evil.invalid/icon.png", "/images/%2e%2e//evil.invalid/icon.png", "/images/%3cscript%3e.png",
    "https://evil.invalid/icon.png", "https://user:secret@evil.invalid/icon.png",
  ]) assert.equal(getPublishedFaviconHref({ published_url, published_version: 4 }), DEFAULT_FAVICON_HREF, published_url);
});

test("only this site's public brand storage is accepted for remote Engine publications", () => {
  const origin = { storageUrl: "https://brand-fixture.invalid/rest/v1/" };
    const source = "https://brand-fixture.invalid/storage/v1/object/public/platform-brand-assets/assets/favicon/id.png?download=1&v=99#icon";
    assert.equal(getPublishedFaviconHref({ published_url: source, published_version: 12 }, origin), source.replace("v=99", "v=12"));
    for (const published_url of [
      source.replace("brand-fixture.invalid", "foreign.invalid"),
      source.replace("platform-brand-assets", "content-media"),
      source.replace("/public/", "/sign/"),
      source.replace("https:", "http:"),
      source.replace("https://", "https://user:password@"),
    ]) assert.equal(getPublishedFaviconHref({ published_url, published_version: 12 }, origin), DEFAULT_FAVICON_HREF);
});

test("HTTP storage is limited to the explicit localhost acceptance harness", () => {
  const origin = { storageUrl: "http://127.0.0.1:3105" };
  const source = "http://127.0.0.1:3105/storage/v1/object/public/platform-brand-assets/favicon.png";
  assert.equal(getPublishedFaviconHref({ published_url: source, published_version: 2 }, origin), DEFAULT_FAVICON_HREF);
  assert.equal(getPublishedFaviconHref({ published_url: source, published_version: 2 }, { ...origin, acceptanceHarness: true }), `${source}?v=2`);
  assert.equal(getPublishedFaviconHref({ published_url: source.replace("127.0.0.1:3105", "foreign.invalid"), published_version: 2 }, { storageUrl: "http://foreign.invalid", acceptanceHarness: true }), DEFAULT_FAVICON_HREF);
});

function legacyRoute(readPublished) {
  const source = readFileSync(new URL("../src/app/favicon.ico/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports, Response,
    require(name) {
      if (name === "@/lib/brandAssets") return { getPublishedBrandAsset: readPublished };
      if (name === "@/lib/brandFavicon") return { getPublishedFaviconHref };
      throw new Error(`Unexpected route dependency: ${name}`);
    },
  });
  return exports;
}

test("the legacy favicon is a dynamic route, not a competing static metadata file", () => {
  assert.equal(statSync(new URL("../src/app/favicon.ico", import.meta.url)).isDirectory(), true);
  const route = legacyRoute(async () => null);
  assert.equal(route.dynamic, "force-dynamic");
  assert.equal(typeof route.GET, "function");
  assert.equal(typeof route.HEAD, "function");
});

test("legacy GET and HEAD use the current published version and prohibit browser/CDN caching", async () => {
  let version = 1;
  const calls = [];
  const route = legacyRoute(async key => {
    calls.push(key);
    return { published_url: "/brand/uploaded-favicon.png?v=old#icon", published_version: version };
  });
  for (const method of ["GET", "HEAD", "GET"]) {
    const response = await route[method]();
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("Location"), `/brand/uploaded-favicon.png?v=${version}#icon`);
    assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
    assert.equal(response.headers.get("Netlify-CDN-Cache-Control"), "no-store");
    assert.equal(await response.text(), "");
    version++;
  }
  assert.deepEqual(calls, ["favicon", "favicon", "favicon"]);
});

test("legacy requests use the approved fallback when the published reader has no valid asset", async () => {
  for (const asset of [null, { published_url: "javascript:alert(1)", published_version: 2 }, { draft_url: "/brand/draft.png", published_version: 0 }]) {
    const route = legacyRoute(async () => asset);
    const response = await route.GET();
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("Location"), DEFAULT_FAVICON_HREF);
  }
});
