export type IsolatedCleanupBatchResult = {
  attempted: number;
  succeeded: number;
  failed: number;
};

export async function runIsolatedCleanupBatch<T>(
  items: readonly T[],
  cleanup: (item: T, index: number) => Promise<void>,
  onFailure: (error: unknown, item: T, index: number) => void,
): Promise<IsolatedCleanupBatchResult> {
  let succeeded = 0;
  let failed = 0;

  for (let index = 0; index < items.length; index += 1) {
    try {
      await cleanup(items[index], index);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      onFailure(error, items[index], index);
    }
  }

  return {
    attempted: items.length,
    succeeded,
    failed,
  };
}

type FailureReporterSummary = {
  total: number;
  reported: number;
  omitted: number;
};

export function createBoundedCleanupFailureReporter(
  report: (scope: string, error: unknown) => void,
  limit = 8,
) {
  const safeLimit = Math.max(0, Math.min(10, Math.floor(limit)));
  const reportedScopes = new Set<string>();
  let total = 0;
  let reported = 0;

  return {
    record(scope: string, error: unknown) {
      total += 1;
      const normalizedScope = String(scope || "media-cleanup")
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "media-cleanup";
      if (reported >= safeLimit || reportedScopes.has(normalizedScope)) {
        return false;
      }
      reportedScopes.add(normalizedScope);
      reported += 1;
      report(normalizedScope, error);
      return true;
    },
    summary(): FailureReporterSummary {
      return {
        total,
        reported,
        omitted: Math.max(0, total - reported),
      };
    },
  };
}
