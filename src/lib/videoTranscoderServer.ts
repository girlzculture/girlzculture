import "server-only";

import {
  classifyVideoProviderStatus,
  loadVideoTranscoderRuntime,
  missingVideoTranscoderConfiguration,
  providerNetworkFailure,
  type VideoTranscoderDiagnostic,
  type VideoTranscoderRuntimeConfig,
} from "@/lib/videoTranscoderCore";

/**
 * Netlify's Next.js adapter executes Route Handlers in a Node function. Reading
 * through a dynamic key keeps these credentials request-time/server-only and
 * prevents Next.js from treating them as build-time public replacements.
 *
 * This loader is intentionally not cached: a new function invocation evaluates
 * the environment attached to that deployment.
 */
export function loadVideoTranscoderRuntimeConfig(): VideoTranscoderRuntimeConfig {
  return loadVideoTranscoderRuntime((name) => process.env[name]);
}

export function videoTranscoderRuntimeDiagnostic(): VideoTranscoderDiagnostic {
  return loadVideoTranscoderRuntimeConfig().diagnostic;
}

export function videoTranscoderConfigured() {
  return videoTranscoderRuntimeDiagnostic().configured;
}

async function providerFetch(
  input: string,
  init: RequestInit,
  operation: "connection" | "transcode",
  timeoutMilliseconds = 10_000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    const response = await fetch(input, {
      ...init,
      signal: init.signal || controller.signal,
      cache: "no-store",
    });
    if (!response.ok)
      throw classifyVideoProviderStatus(response.status, operation);
    return response;
  } catch (error) {
    throw providerNetworkFailure(error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function testVideoTranscoderConnection() {
  const runtime = loadVideoTranscoderRuntimeConfig();
  if (runtime.cloudinary) {
    await providerFetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(runtime.cloudinary.cloudName)}/resources/video?max_results=1`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${runtime.cloudinary.apiKey}:${runtime.cloudinary.apiSecret}`,
          ).toString("base64")}`,
        },
      },
      "connection",
    );
    return { provider: "cloudinary" as const, state: "healthy" as const };
  }
  if (!runtime.custom) throw missingVideoTranscoderConfiguration();
  await providerFetch(
    runtime.custom.endpoint,
    {
      method: "HEAD",
      headers: { Authorization: `Bearer ${runtime.custom.token}` },
    },
    "connection",
  );
  return { provider: "custom" as const, state: "healthy" as const };
}
