export function stripBrandAssetVersion(url: string) {
  return url.replace(/[?&]v=\d+$/, "");
}

export function versionBrandAssetUrl(url: string, version: number) {
  const base = stripBrandAssetVersion(url);
  return `${base}${base.includes("?") ? "&" : "?"}v=${version}`;
}

export function normalizeBrandFocalPoint(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}

export type BrandAssetBinary = {
  bytes: Uint8Array;
  mimeType:
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/svg+xml"
    | "image/x-icon";
  extension: "png" | "jpg" | "webp" | "svg" | "ico";
  width?: number;
  height?: number;
};

/**
 * File.arrayBuffer() is typed as ArrayBuffer but some runtimes expose a view
 * backed by SharedArrayBuffer. Supabase Storage deliberately rejects that
 * backing store. Always copy the bytes into a newly allocated ordinary
 * ArrayBuffer before passing them to Sharp or Storage.
 */
export function copyBrandUploadBytes(
  input: ArrayBufferLike | Uint8Array,
): Uint8Array {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function safeSvgText(bytes: Uint8Array) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
  if (!/<svg(?:\s|>)/i.test(text))
    throw new Error("The uploaded SVG is not readable.");
  if (
    /<!doctype|<!entity|<\s*(?:script|foreignObject|iframe|object|embed|link|meta)\b|\bon[a-z]+\s*=|javascript\s*:|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:)|url\s*\(\s*["']?\s*(?:https?:|\/\/|data:)/i.test(
      text,
    )
  )
    throw new Error(
      "This SVG contains unsupported active or external content.",
    );
  return text;
}

export function inspectBrandAssetBinary(
  input: ArrayBufferLike | Uint8Array,
): BrandAssetBinary {
  const bytes = copyBrandUploadBytes(input);
  if (
    bytes.byteLength >= 24 &&
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  )
    return { bytes, mimeType: "image/png", extension: "png" };
  if (
    bytes.byteLength >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return { bytes, mimeType: "image/webp", extension: "webp" };
  if (
    bytes.byteLength >= 4 &&
    startsWith(bytes, [0xff, 0xd8, 0xff])
  )
    return { bytes, mimeType: "image/jpeg", extension: "jpg" };
  if (
    bytes.byteLength >= 22 &&
    startsWith(bytes, [0x00, 0x00, 0x01, 0x00]) &&
    bytes[4] + bytes[5] * 256 > 0
  ) {
    const width = bytes[6] || 256;
    const height = bytes[7] || 256;
    return {
      bytes,
      mimeType: "image/x-icon",
      extension: "ico",
      width,
      height,
    };
  }
  try {
    safeSvgText(bytes);
    return { bytes, mimeType: "image/svg+xml", extension: "svg" };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("unsupported active or external content")
    )
      throw error;
  }
  throw new Error("Use a real PNG, WebP, JPEG, safe SVG, or ICO image.");
}
