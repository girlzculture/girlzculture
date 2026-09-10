import "server-only";

import { getContentPage, getPublishedContentPage, type ContentPage } from "@/lib/content";
import {
  BUSINESS_SIGNUP_CONTENT_LABEL,
  BUSINESS_SIGNUP_CONTENT_SLUG,
  DEFAULT_BUSINESS_SIGNUP_CONTENT,
  decodeBusinessSignupContent,
  encodeBusinessSignupContent,
  validateBusinessSignupContent,
} from "@/lib/businessSignupContent";

const fallback: ContentPage = {
  slug: BUSINESS_SIGNUP_CONTENT_SLUG,
  title: "Business Signup Landing Page",
  labels: { [BUSINESS_SIGNUP_CONTENT_LABEL]: encodeBusinessSignupContent(DEFAULT_BUSINESS_SIGNUP_CONTENT) },
};

/** Public snapshots only. Lead intake additionally fails closed on read/config errors. */
export async function getBusinessSignupContent({ requirePublished = false }: { requirePublished?: boolean } = {}) {
  const page = requirePublished
    ? await getPublishedContentPage(BUSINESS_SIGNUP_CONTENT_SLUG)
    : await getContentPage(BUSINESS_SIGNUP_CONTENT_SLUG, fallback);
  if (!page) return null;
  if (!requirePublished) return decodeBusinessSignupContent(page.labels);
  try {
    const serialized = page.labels?.[BUSINESS_SIGNUP_CONTENT_LABEL];
    if (!serialized || serialized.length > 64_000) return null;
    return validateBusinessSignupContent(JSON.parse(serialized), { forPublication: true });
  } catch {
    return null;
  }
}
