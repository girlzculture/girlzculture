export type MediaQueueRunResult = {
  completed: number;
  failed: number;
};

/**
 * Runs uploads in a bounded, deterministic order. A rejected/failed file is
 * counted and the remaining files continue instead of losing the whole batch.
 */
export async function runMediaUploadQueue(
  ids: string[],
  worker: (id: string) => Promise<boolean>,
): Promise<MediaQueueRunResult> {
  let completed = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      if (await worker(id)) completed += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { completed, failed };
}
