"use client";

import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useSyncExternalStore,
} from "react";

const contextEvent = "girlz-culture:admin-list-context";
const scrollPrefix = "girlz-culture:admin-list-scroll:";

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(contextEvent, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(contextEvent, listener);
  };
}

function clientSnapshot() {
  return window.location.search;
}

function serverSnapshot() {
  return "";
}

export function useAdminQueryParam(key: string, fallback = "") {
  const search = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const value = new URLSearchParams(search).get(key) || fallback;
  const setValue = useCallback((next: string) => {
    const params = new URLSearchParams(window.location.search);
    if (next && next !== fallback) params.set(key, next); else params.delete(key);
    const suffix = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}${window.location.hash}`);
    window.dispatchEvent(new Event(contextEvent));
  }, [fallback, key]);
  return [value, setValue] as const;
}

export function useAdminListContext(statusFallback = "all") {
  const [query, setQuery] = useAdminQueryParam("q", "");
  const [status, setStatus] = useAdminQueryParam("status", statusFallback);
  return { query, setQuery, status, setStatus };
}

export function rememberAdminListScroll(event: ReactMouseEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor) return;
  try {
    const destination = new URL(anchor.href, window.location.origin);
    const returnTo = destination.searchParams.get("return");
    if (!returnTo?.startsWith("/admin/")) return;
    window.sessionStorage.setItem(`${scrollPrefix}${returnTo}`, String(window.scrollY));
  } catch {
    // Navigation remains usable when storage is unavailable or the URL is invalid.
  }
}

export function useAdminListScrollRestoration(ready = true) {
  useEffect(() => {
    if (!ready) return;
    const route = `${window.location.pathname}${window.location.search}`;
    const key = `${scrollPrefix}${route}`;
    const stored = Number(window.sessionStorage.getItem(key) || 0);
    if (!Number.isFinite(stored) || stored <= 0) return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: stored, behavior: "instant" });
      window.sessionStorage.removeItem(key);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready]);
}
