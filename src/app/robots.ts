import type { MetadataRoute } from "next";
import { customerMarketplaceLive } from "@/lib/marketplaceLaunchCore";

export default function robots(): MetadataRoute.Robots {
  const indexable=customerMarketplaceLive() && process.env.NEXT_PUBLIC_ALLOW_INDEXING==="true";
  return {rules:{userAgent:"*",allow:indexable?"/":undefined,disallow:indexable?["/admin/","/salon/dashboard/","/account/"]:"/"}};
}
