import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const indexable=process.env.NEXT_PUBLIC_ALLOW_INDEXING==="true";
  return {rules:{userAgent:"*",allow:indexable?"/":undefined,disallow:indexable?["/admin/","/salon/dashboard/","/account/"]:"/"}};
}
