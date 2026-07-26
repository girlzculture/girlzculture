export const CLOUDINARY_RUNTIME_VARIABLE_NAMES = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
] as const;

export type CloudinaryRuntimeVariableName =
  (typeof CLOUDINARY_RUNTIME_VARIABLE_NAMES)[number];

export type VideoTranscoderFailureState =
  | "missing_deployment_configuration"
  | "invalid_cloudinary_credentials"
  | "cloudinary_provider_outage"
  | "unsupported_input_media"
  | "transcoding_failure";

export type VideoTranscoderDiagnostic = {
  provider: "cloudinary" | "custom" | "none";
  configured: boolean;
  cloudinaryConfigured: boolean;
  customFallbackConfigured: boolean;
  runtime: "nodejs";
  variables: Array<{
    name: CloudinaryRuntimeVariableName;
    present: boolean;
  }>;
  missingVariables: CloudinaryRuntimeVariableName[];
};

export type CloudinaryRuntimeConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

export type CustomTranscoderRuntimeConfig = {
  endpoint: string;
  token: string;
};

export type VideoTranscoderRuntimeConfig = {
  diagnostic: VideoTranscoderDiagnostic;
  cloudinary: CloudinaryRuntimeConfig | null;
  custom: CustomTranscoderRuntimeConfig | null;
};

export class VideoTranscoderError extends Error {
  readonly code: string;
  readonly state: VideoTranscoderFailureState;
  readonly status: number;
  readonly provider = "cloudinary";
  readonly safeMessage: string;

  constructor(input: {
    code: string;
    state: VideoTranscoderFailureState;
    status: number;
    safeMessage: string;
  }) {
    super(input.code);
    this.name = "VideoTranscoderError";
    this.code = input.code;
    this.state = input.state;
    this.status = input.status;
    this.safeMessage = input.safeMessage;
  }
}

function present(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeHttpsUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function loadVideoTranscoderRuntime(
  readEnvironment: (name: string) => string | undefined,
): VideoTranscoderRuntimeConfig {
  const values = Object.fromEntries(
    CLOUDINARY_RUNTIME_VARIABLE_NAMES.map((name) => [
      name,
      String(readEnvironment(name) || "").trim(),
    ]),
  ) as Record<CloudinaryRuntimeVariableName, string>;
  const variables = CLOUDINARY_RUNTIME_VARIABLE_NAMES.map((name) => ({
    name,
    present: present(values[name]),
  }));
  const missingVariables = variables
    .filter((variable) => !variable.present)
    .map((variable) => variable.name);
  const cloudinaryConfigured = missingVariables.length === 0;
  const customEndpoint = safeHttpsUrl(
    readEnvironment("MEDIA_TRANSCODE_ENDPOINT"),
  );
  const customToken = String(
    readEnvironment("MEDIA_TRANSCODE_TOKEN") || "",
  ).trim();
  const customFallbackConfigured = Boolean(customEndpoint && customToken);
  const provider = cloudinaryConfigured
    ? "cloudinary"
    : customFallbackConfigured
      ? "custom"
      : "none";

  return {
    diagnostic: {
      provider,
      configured: cloudinaryConfigured || customFallbackConfigured,
      cloudinaryConfigured,
      customFallbackConfigured,
      runtime: "nodejs",
      variables,
      missingVariables,
    },
    cloudinary: cloudinaryConfigured
      ? {
          cloudName: values.CLOUDINARY_CLOUD_NAME,
          apiKey: values.CLOUDINARY_API_KEY,
          apiSecret: values.CLOUDINARY_API_SECRET,
        }
      : null,
    custom: customFallbackConfigured
      ? { endpoint: customEndpoint, token: customToken }
      : null,
  };
}

export function missingVideoTranscoderConfiguration() {
  return new VideoTranscoderError({
    code: "VIDEO_TRANSCODER_NOT_CONFIGURED",
    state: "missing_deployment_configuration",
    status: 503,
    safeMessage:
      "Video processing is unavailable because required deployment configuration is missing.",
  });
}

export function classifyVideoProviderStatus(
  status: number,
  operation: "connection" | "transcode",
) {
  if (
    status === 401 ||
    status === 403 ||
    (operation === "connection" && [400, 404].includes(status))
  ) {
    return new VideoTranscoderError({
      code: "VIDEO_TRANSCODER_INVALID_CREDENTIALS",
      state: "invalid_cloudinary_credentials",
      status: 502,
      safeMessage:
        "Cloudinary rejected the configured cloud name or API credentials.",
    });
  }
  if ([408, 425, 429].includes(status) || status >= 500) {
    return new VideoTranscoderError({
      code: "VIDEO_TRANSCODER_PROVIDER_UNAVAILABLE",
      state: "cloudinary_provider_outage",
      status: 503,
      safeMessage:
        "Cloudinary is temporarily unavailable or did not respond in time.",
    });
  }
  if (
    operation === "transcode" &&
    [400, 404, 415, 422].includes(status)
  ) {
    return new VideoTranscoderError({
      code: "VIDEO_UNSUPPORTED_INPUT_MEDIA",
      state: "unsupported_input_media",
      status: 415,
      safeMessage:
        "Choose a supported MP4, WebM, MOV, M4V, or Matroska video and try again.",
    });
  }
  return new VideoTranscoderError({
    code: "VIDEO_TRANSCODING_FAILED",
    state: "transcoding_failure",
    status: 502,
    safeMessage: "Cloudinary could not create a browser-ready video.",
  });
}

export function classifyVideoTranscoderError(
  error: unknown,
): VideoTranscoderError {
  if (error instanceof VideoTranscoderError) return error;
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const code = String(
    record.code || (error instanceof Error ? error.message : ""),
  );
  if (code === "VIDEO_TRANSCODER_NOT_CONFIGURED")
    return missingVideoTranscoderConfiguration();
  if (code === "VIDEO_TRANSCODER_INVALID_CREDENTIALS")
    return classifyVideoProviderStatus(401, "connection");
  if (
    code === "VIDEO_TRANSCODER_PROVIDER_UNAVAILABLE" ||
    code === "AbortError" ||
    (error instanceof Error && error.name === "AbortError")
  )
    return classifyVideoProviderStatus(503, "connection");
  if (code === "VIDEO_UNSUPPORTED_INPUT_MEDIA")
    return classifyVideoProviderStatus(415, "transcode");
  return new VideoTranscoderError({
    code: "VIDEO_TRANSCODING_FAILED",
    state: "transcoding_failure",
    status: 502,
    safeMessage: "The video could not be prepared for browser playback.",
  });
}

export function providerNetworkFailure(error: unknown) {
  if (error instanceof VideoTranscoderError) return error;
  return new VideoTranscoderError({
    code: "VIDEO_TRANSCODER_PROVIDER_UNAVAILABLE",
    state: "cloudinary_provider_outage",
    status: 503,
    safeMessage:
      "Cloudinary is temporarily unavailable or did not respond in time.",
  });
}
