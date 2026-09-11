import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = new URL(process.argv[2] || "http://127.0.0.1:3104/");
if (target.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(target.hostname) || target.username || target.password) {
  throw new Error("This read-only probe accepts credential-free loopback HTTP URLs only.");
}
const output = path.resolve(process.argv[3] || "../favicon-evidence/baseline-tab.json");
const extension = fileURLToPath(new URL("../tests/fixtures/favicon-probe", import.meta.url));
const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const page = context.pages()[0] || await context.newPage();
  const response = await page.goto(target.href, { waitUntil: "load" });
  // Wait for the browser's own asynchronous icon selection, not just a link tag.
  let tab;
  for (let attempt = 0; attempt < 80; attempt++) {
    tab = await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({});
      return tabs.find((entry) => entry.url === url);
    }, target.href);
    if (tab?.favIconUrl) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!tab?.favIconUrl) throw new Error("Chromium did not report a selected tab favicon.");
  const cached = await worker.evaluate(async (url) => {
    const icon = new URL(chrome.runtime.getURL("/_favicon/"));
    icon.searchParams.set("pageUrl", url);
    icon.searchParams.set("size", "32");
    const response = await fetch(icon);
    return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] };
  }, target.href);
  const evidence = {
    source: "Chromium chrome.tabs.Tab.favIconUrl and browser favicon cache API",
    browserVersion: context.browser()?.version(),
    url: target.href,
    status: response?.status(),
    selectedFavicon: tab.favIconUrl,
    cacheStatus: cached.status,
    cacheBytes: cached.bytes.length,
    declaredIcons: await page.locator('link[rel~="icon"]').evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(output.replace(/\.json$/, ".png"), Buffer.from(cached.bytes));
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await context.close();
}
