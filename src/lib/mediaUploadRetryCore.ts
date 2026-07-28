export const MEDIA_FINALIZE_MAX_ATTEMPTS = 3;

export function shouldRetryMediaFinalizeStatus(status: number) {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

export function mediaFinalizeRetryDelay(attempt: number) {
  const boundedAttempt = Math.max(1, Math.min(3, Math.round(attempt)));
  return 200 * 2 ** (boundedAttempt - 1);
}

export function mediaFinalizeSessionIsTerminal(status: number) {
  return (
    status === 400 ||
    status === 404 ||
    status === 409 ||
    status === 410
  );
}

export type MediaFinalizeAttemptResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: Error };

export async function runBoundedMediaFinalize<T>(input: {
  uploadId: string;
  attempt: (
    uploadId: string,
    attempt: number,
  ) => Promise<MediaFinalizeAttemptResult<T>>;
  onRetry?: (nextAttempt: number) => void;
  wait?: (delay: number) => Promise<void>;
}) {
  const wait =
    input.wait ||
    ((delay: number) =>
      new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, delay);
      }));
  let lastFailure = new Error(
    "The image uploaded, but could not be attached.",
  );
  for (
    let attemptNumber = 1;
    attemptNumber <= MEDIA_FINALIZE_MAX_ATTEMPTS;
    attemptNumber += 1
  ) {
    let result: MediaFinalizeAttemptResult<T>;
    try {
      result = await input.attempt(input.uploadId, attemptNumber);
    } catch {
      result = {
        ok: false,
        status: 503,
        error: new Error(
          "The image uploaded, but the save confirmation was interrupted. Retry to finish the same upload.",
        ),
      };
    }
    if (result.ok) return result.value;
    lastFailure = result.error;
    if (
      attemptNumber >= MEDIA_FINALIZE_MAX_ATTEMPTS ||
      !shouldRetryMediaFinalizeStatus(result.status)
    ) {
      throw lastFailure;
    }
    input.onRetry?.(attemptNumber + 1);
    await wait(mediaFinalizeRetryDelay(attemptNumber));
  }
  throw lastFailure;
}
