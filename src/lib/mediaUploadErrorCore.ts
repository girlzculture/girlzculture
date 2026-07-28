export type ExpectedMediaRequestFailure = {
  status: 400 | 401 | 403 | 404 | 409;
  message: string;
};

/**
 * Only classifies application-authored, user-safe failures. Provider,
 * database, RLS, and other unexpected messages deliberately return null so
 * the route records a sanitized Engine incident instead of reflecting raw
 * infrastructure details to the browser.
 */
export function expectedMediaRequestFailure(
  error: unknown,
): ExpectedMediaRequestFailure | null {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return null;
  if (
    /^(Unauthorized|Your session has expired\. Please sign in again\.|Please sign in(?: again)? before\b)/i.test(
      message,
    )
  ) {
    return { status: 401, message };
  }
  if (
    /^(Forbidden\b|This upload folder does not belong to your salon\.|This photo does not belong to your salon or stylist form\.|Review photos are available only for your completed booking\.)/i.test(
      message,
    )
  ) {
    return { status: 403, message };
  }
  if (
    /^(The upload session was not found\.|The media attachment record was not found\.|Prepared media attachment record was not found\.?)/i.test(
      message,
    )
  ) {
    return { status: 404, message };
  }
  if (
    /^(The upload session is no longer available\.|Upload session is no longer available\.?)/i.test(
      message,
    )
  ) {
    return { status: 409, message };
  }
  if (
    /^(This upload destination is not supported\.|This image placement is not supported\.|The (source|desktop|tablet|mobile) image (was not prepared|details are invalid)\.|Upload a supported JPG, PNG, or animated GIF\.|The original image must be 12 MB or smaller\.|.+ images must be at least \d+ .+ \d+px\.|Animated GIF uploads preserve one responsive source\.|The animated GIF must be \d+ MB or smaller for public delivery\.|Responsive image renditions must be JPG or PNG\.|The (desktop|tablet|mobile) image must be \d+ MB or smaller\.|The (desktop|tablet|mobile) crop must be \d+ .+ \d+px\.|The media attachment is invalid\.|The (salon|service|stylist|product) media attachment is invalid\.|This media attachment is not supported\.|Save this service before uploading its images\.|The upload reference is invalid\.|The prepared upload is invalid\.|The prepared upload is incomplete\.|The (source|desktop|tablet|mobile) upload (type|size|dimensions) does not match its preparation\.|This file is damaged or its image format does not match its extension\.|The public image rendition is unavailable\.|Only already attached media can be reordered or removed\.)$/i.test(
      message,
    )
  ) {
    return { status: 400, message };
  }
  return null;
}
