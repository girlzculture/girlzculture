export const GOOGLE_MAPS_AUTOMATIC_RETRY_LIMIT = 1;

export type GoogleMapsLoadCode =
  | "GOOGLE_MAPS_NOT_CONFIGURED"
  | "GOOGLE_MAPS_AUTH_REJECTED"
  | "GOOGLE_MAPS_LOAD_TIMEOUT"
  | "GOOGLE_MAPS_SCRIPT_FAILED"
  | "GOOGLE_MAPS_SDK_INVALID";

const transientLoadCodes = new Set<GoogleMapsLoadCode>([
  "GOOGLE_MAPS_LOAD_TIMEOUT",
  "GOOGLE_MAPS_SCRIPT_FAILED",
]);

export function shouldRetryGoogleMapsLoad(
  code: GoogleMapsLoadCode,
  retriesCompleted: number,
) {
  return (
    retriesCompleted < GOOGLE_MAPS_AUTOMATIC_RETRY_LIMIT &&
    transientLoadCodes.has(code)
  );
}

export async function runGoogleMapsLoadWithRetry<T>({
  load,
  reset,
  codeForError,
  wait = (milliseconds) =>
    new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds)),
}: {
  load: () => Promise<T>;
  reset: () => void;
  codeForError: (error: unknown) => GoogleMapsLoadCode | null;
  wait?: (milliseconds: number) => Promise<void>;
}) {
  let retriesCompleted = 0;
  for (;;) {
    try {
      return await load();
    } catch (error) {
      const code = codeForError(error);
      if (!code || !shouldRetryGoogleMapsLoad(code, retriesCompleted)) {
        throw error;
      }
      retriesCompleted += 1;
      reset();
      await wait(250);
    }
  }
}

/**
 * `loading=async` may fire the script load event before importLibrary is
 * attached. Treat that short provider initialization window as pending, not as
 * an invalid SDK response.
 */
export async function waitForGoogleMapsSdkReady({
  isReady,
  wait = (milliseconds) =>
    new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds)),
  timeoutMs = 3_000,
  intervalMs = 50,
}: {
  isReady: () => boolean;
  wait?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  if (isReady()) return true;
  const attempts = Math.max(1, Math.ceil(timeoutMs / Math.max(1, intervalMs)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(intervalMs);
    if (isReady()) return true;
  }
  return false;
}

export function googleMapsIncidentMessage(
  providerMessage: string,
  reference: string | null,
) {
  const message =
    providerMessage.trim() ||
    "Google Maps could not complete this location request.";
  if (!reference) return message;
  if (message.includes(reference)) return message;
  return `${message.replace(/[.\s]+$/, "")}. Reference ${reference}.`;
}
