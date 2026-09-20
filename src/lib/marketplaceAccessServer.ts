import "server-only";
import {headers} from "next/headers";
import {customerMarketplaceLive,SITE_ACCESS_ENTRY_PATH,SITE_ACCESS_HEADER} from "@/lib/marketplaceLaunchCore";

export async function siteAccessActive() { return (await headers()).get(SITE_ACCESS_HEADER)==="1"; }
export async function marketplaceBrowsingAvailable() { return customerMarketplaceLive() || await siteAccessActive(); }
export async function marketplaceHomeHref() { return await siteAccessActive()?SITE_ACCESS_ENTRY_PATH:"/"; }
