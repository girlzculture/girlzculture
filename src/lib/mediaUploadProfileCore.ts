import type {
  ImagePresetKey,
  ImageUploadProfile,
} from "@/lib/imageUpload";

export type MediaUploadProfileConfiguration = {
  display_name?: unknown;
  aspect_width?: unknown;
  aspect_height?: unknown;
  min_width_px?: unknown;
  min_height_px?: unknown;
  output_width_px?: unknown;
  max_bytes?: unknown;
  safe_area_enabled?: unknown;
  accepted_mime_types?: unknown;
};

type MediaUploadProfileQueryResult = {
  data: MediaUploadProfileConfiguration | null;
  error?: unknown;
};

export type MediaUploadProfileResolution = {
  profile: ImageUploadProfile & { quality: number };
  failures: MediaUploadProfileFailure[];
};

export type MediaUploadProfileFailure = {
  operation: string;
  error: unknown;
};

export const MEDIA_UPLOAD_PROFILE_TIMEOUT_MS = 750;
export const MEDIA_UPLOAD_PROFILE_WARNING_INTERVAL_MS = 5 * 60 * 1_000;

const fallbackWarningTimes = new Map<string, number>();

const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
]);

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function configuredMimeTypes(value: unknown, fallback?: string[]) {
  if (!Array.isArray(value)) return fallback;
  const configured = value
    .map((item) => String(item).trim().toLowerCase())
    .filter((item) => SAFE_IMAGE_MIME_TYPES.has(item));
  return configured.length ? configured : fallback;
}

async function withDeadline<T>(
  operation: () => PromiseLike<T>,
  timeoutMs: number,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(
        Object.assign(new Error("MEDIA_UPLOAD_PROFILE_LOOKUP_TIMEOUT"), {
          code: "MEDIA_UPLOAD_PROFILE_LOOKUP_TIMEOUT",
        }),
      );
    }, Math.max(1, Math.floor(timeoutMs)));
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation()),
      deadline,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Emits one safe process warning per placement/failure set in a bounded time
 * window. No provider text is logged and no database write delays the caller.
 */
export function reportMediaUploadProfileFallback(input: {
  kind: ImagePresetKey;
  failures: MediaUploadProfileFailure[];
  now?: number;
  minimumIntervalMs?: number;
  state?: Map<string, number>;
  write?: (warning: {
    code: "MEDIA_UPLOAD_PROFILE_FALLBACK";
    kind: ImagePresetKey;
    operations: string[];
  }) => void;
}) {
  const operations = [...new Set(input.failures.map((item) => item.operation))]
    .sort();
  if (!operations.length) return false;
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  const minimumIntervalMs = Math.max(
    1,
    Number(
      input.minimumIntervalMs ?? MEDIA_UPLOAD_PROFILE_WARNING_INTERVAL_MS,
    ),
  );
  const state = input.state || fallbackWarningTimes;
  const key = `${input.kind}:${operations.join("|")}`;
  const lastWarning = state.get(key);
  if (
    typeof lastWarning === "number" &&
    now - lastWarning < minimumIntervalMs
  ) {
    return false;
  }
  state.set(key, now);
  const warning = {
    code: "MEDIA_UPLOAD_PROFILE_FALLBACK" as const,
    kind: input.kind,
    operations,
  };
  if (input.write) {
    input.write(warning);
  } else {
    process.emitWarning(
      `Checked-in media profile used for ${input.kind}.`,
      {
        code: warning.code,
        detail: `Unavailable optional reads: ${operations.join(", ")}.`,
      },
    );
  }
  return true;
}

/**
 * Resolves optional database/Engine overrides without making the upload
 * pipeline depend on those reads. The checked-in profile remains a safe,
 * server-enforced configuration when either provider read is unavailable.
 */
export async function resolveMediaUploadProfile(input: {
  fallback: ImageUploadProfile;
  loadConfiguration: () => PromiseLike<MediaUploadProfileQueryResult>;
  loadQuality: () => PromiseLike<unknown>;
  fallbackQuality?: number;
  timeoutMs?: number;
}): Promise<MediaUploadProfileResolution> {
  const timeoutMs = Number.isFinite(input.timeoutMs)
    ? Math.max(1, Number(input.timeoutMs))
    : MEDIA_UPLOAD_PROFILE_TIMEOUT_MS;
  const [configurationResult, qualityResult] = await Promise.allSettled([
    withDeadline(input.loadConfiguration, timeoutMs),
    withDeadline(input.loadQuality, timeoutMs),
  ]);
  const failures: MediaUploadProfileResolution["failures"] = [];

  let configuration: MediaUploadProfileConfiguration | null = null;
  if (configurationResult.status === "rejected") {
    failures.push({
      operation: "load media upload profile configuration",
      error: configurationResult.reason,
    });
  } else if (configurationResult.value.error) {
    failures.push({
      operation: "load media upload profile configuration",
      error: configurationResult.value.error,
    });
  } else {
    configuration = configurationResult.value.data;
  }

  const requestedFallbackQuality = Number(input.fallbackQuality ?? 88);
  const fallbackQuality = Number.isFinite(requestedFallbackQuality)
    ? Math.min(100, Math.max(60, requestedFallbackQuality))
    : 88;
  let quality = fallbackQuality;
  if (qualityResult.status === "rejected") {
    failures.push({
      operation: "load media image quality",
      error: qualityResult.reason,
    });
  } else {
    const configuredQuality = Number(qualityResult.value);
    if (
      Number.isFinite(configuredQuality) &&
      configuredQuality >= 60 &&
      configuredQuality <= 100
    ) {
      quality = configuredQuality;
    }
  }

  if (!configuration) {
    return {
      profile: { ...input.fallback, quality },
      failures,
    };
  }

  const configuredLabel = String(configuration.display_name || "").trim();
  return {
    profile: {
      ...input.fallback,
      label: configuredLabel || input.fallback.label,
      aspectWidth: positiveNumber(
        configuration.aspect_width,
        input.fallback.aspectWidth,
      ),
      aspectHeight: positiveNumber(
        configuration.aspect_height,
        input.fallback.aspectHeight,
      ),
      minWidth: positiveNumber(
        configuration.min_width_px,
        input.fallback.minWidth,
      ),
      minHeight: positiveNumber(
        configuration.min_height_px,
        input.fallback.minHeight,
      ),
      outputWidth: positiveNumber(
        configuration.output_width_px,
        input.fallback.outputWidth,
      ),
      maxBytes: positiveNumber(
        configuration.max_bytes,
        input.fallback.maxBytes,
      ),
      safeArea:
        typeof configuration.safe_area_enabled === "boolean"
          ? configuration.safe_area_enabled
          : input.fallback.safeArea,
      acceptedMimeTypes: configuredMimeTypes(
        configuration.accepted_mime_types,
        input.fallback.acceptedMimeTypes,
      ),
      quality,
    },
    failures,
  };
}
