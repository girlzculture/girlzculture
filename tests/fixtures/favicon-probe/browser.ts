import { chromium } from "playwright";
import { resolve } from "node:path";
import type { BrowserContext, Worker } from "@playwright/test";

type ChromeTab = { url?: string; favIconUrl?: string; incognito?: boolean };
declare const chrome: {
  tabs: { query: (query: Record<string, unknown>) => Promise<ChromeTab[]> };
  runtime: { getURL: (path: string) => string };
};

export async function launchFaviconObserver() {
  const extension = resolve(__dirname);
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  return { context, worker };
}

/** Uses Chrome's tab model, not document link elements or a manual icon fetch. */
export async function selectedTabIcon(worker: Worker, url: string) {
  return worker.evaluate(async (target: string) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((entry) => entry.url === target);
    return tab ? { url: tab.url, favicon: tab.favIconUrl || null, incognito: tab.incognito } : null;
  }, url);
}

/** Reads the bitmap from Chrome's browser favicon cache, independently of DOM. */
export async function cachedTabIcon(worker: Worker, url: string) {
  return worker.evaluate(async (target: string) => {
    const icon = new URL(chrome.runtime.getURL("/_favicon/"));
    icon.searchParams.set("pageUrl", target);
    icon.searchParams.set("size", "32");
    const response = await fetch(icon);
    return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] };
  }, url);
}

export async function allowObserverInIncognito(context: BrowserContext, worker: Worker) {
  const extensionId = new URL(worker.url()).host;
  const settings = await context.newPage();
  try {
    await settings.goto(`chrome://extensions/?id=${extensionId}`);
    const toggle = settings.locator("extensions-detail-view #allow-incognito cr-toggle");
    await toggle.waitFor({ state: "visible" });
    if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
  } finally {
    await settings.close();
  }
}
