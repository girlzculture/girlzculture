export type PublicationRecord = {
  publication_state?: unknown;
  published_payload?: unknown;
  published_at?: unknown;
  scheduled_payload?: unknown;
  scheduled_publish_at?: unknown;
  archived_at?: unknown;
  is_enabled?: unknown;
};

export type RetainedPublishedVersion = {
  payload: unknown;
  publishedAt: string | null;
  source: "published" | "scheduled";
};

/**
 * Resolve the version that is publicly visible immediately before an editor
 * schedules a replacement. A due scheduled snapshot is the current public
 * version even though it has not been copied into `published_payload` yet.
 * Retaining it prevents scheduling the next version from temporarily
 * resurrecting an older published snapshot.
 */
export function retainedPublishedVersion(
  current: PublicationRecord | null | undefined,
  now = Date.now(),
): RetainedPublishedVersion | null {
  if (!current || current.archived_at || current.is_enabled === false) return null;

  const scheduledAt = Date.parse(String(current.scheduled_publish_at || ""));
  if (
    current.scheduled_payload
    && Number.isFinite(scheduledAt)
    && scheduledAt <= now
    && ["Published", "Scheduled"].includes(String(current.publication_state || ""))
  ) {
    return {
      payload: current.scheduled_payload,
      publishedAt: String(current.scheduled_publish_at || "") || null,
      source: "scheduled",
    };
  }

  if (current.published_payload && current.publication_state === "Published") {
    return {
      payload: current.published_payload,
      publishedAt: String(current.published_at || "") || null,
      source: "published",
    };
  }

  return null;
}
