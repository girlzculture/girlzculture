import "server-only";

import { cookies, headers } from "next/headers";
import {
  customerMarketplaceLive,
  SITE_ACCESS_COOKIE,
  SITE_ACCESS_COOKIE_VALUE,
  SITE_ACCESS_ENTRY_PATH,
  SITE_ACCESS_HEADER,
} from "@/lib/marketplaceLaunchCore";

/** The launch flag is the only way to enable transactions. This helper merely
 * allows the read-only marketplace presentation for a request admitted by the
 * server proxy. */
export async function marketplaceBrowsingAvailable() {
  if (customerMarketplaceLive()) return true;
  try {
    return (await headers()).get(SITE_ACCESS_HEADER) === "1";
  } catch {
    return false;
  }
}

export async function siteAccessActive() {
  if (customerMarketplaceLive()) return false;
  try {
    if ((await headers()).get(SITE_ACCESS_HEADER) === "1") return true;
    return (await cookies()).get(SITE_ACCESS_COOKIE)?.value ===
      SITE_ACCESS_COOKIE_VALUE;
  } catch {
    return false;
  }
}

export async function marketplaceHomeHref() {
  return (await siteAccessActive()) ? SITE_ACCESS_ENTRY_PATH : "/";
}
