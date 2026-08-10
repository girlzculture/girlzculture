export const APPLICATION_DOCUMENT_BUCKET = "application-documents";
export const APPLICATION_DOCUMENT_MAXIMUM_BYTES = 10 * 1024 * 1024;
export const APPLICATION_DOCUMENT_MAXIMUM_COUNT = 5;

export const APPLICATION_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type ApplicationDocumentMimeType =
  (typeof APPLICATION_DOCUMENT_MIME_TYPES)[number];

export type ApplicationDocumentDescriptor = {
  fileName: string;
  mimeType: ApplicationDocumentMimeType;
  sizeBytes: number;
};

export class ApplicationDocumentInputError extends Error {
  public status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApplicationDocumentInputError";
    this.status = status;
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function applicationDocumentFileName(value: unknown) {
  const source = String(value || "document")
    .normalize("NFKC")
    .trim()
    .slice(0, 180);
  const safe = source
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return safe || "document";
}

export function applicationDocumentDescriptor(
  value: Record<string, unknown>,
): ApplicationDocumentDescriptor {
  const mimeType = String(value.mime_type || "").toLowerCase();
  if (
    !APPLICATION_DOCUMENT_MIME_TYPES.includes(
      mimeType as ApplicationDocumentMimeType,
    )
  ) {
    throw new ApplicationDocumentInputError(
      "Upload a PDF, JPG, or PNG supporting document.",
    );
  }
  const sizeBytes = Number(value.size_bytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new ApplicationDocumentInputError(
      "Choose a non-empty supporting document.",
    );
  }
  if (sizeBytes > APPLICATION_DOCUMENT_MAXIMUM_BYTES) {
    throw new ApplicationDocumentInputError(
      "Supporting documents must be 10 MB or smaller.",
    );
  }
  return {
    fileName: applicationDocumentFileName(value.file_name),
    mimeType: mimeType as ApplicationDocumentMimeType,
    sizeBytes,
  };
}

export function applicationDocumentPath(
  ownerId: string,
  uploadId: string,
  fileName: string,
) {
  if (!UUID.test(ownerId) || !UUID.test(uploadId)) {
    throw new ApplicationDocumentInputError(
      "The supporting-document upload reference is invalid.",
    );
  }
  return `${ownerId}/documents/${uploadId}-${applicationDocumentFileName(fileName)}`;
}

export function verifyApplicationDocumentPath(
  path: unknown,
  ownerId: string,
  uploadId: string,
) {
  const value = String(path || "");
  if (
    !UUID.test(ownerId) ||
    !UUID.test(uploadId) ||
    value !== value.trim() ||
    value.includes("..") ||
    !value.startsWith(`${ownerId}/documents/${uploadId}-`) ||
    value.slice(`${ownerId}/documents/${uploadId}-`.length).includes("/") ||
    value.length > 500
  ) {
    throw new ApplicationDocumentInputError(
      "The supporting-document upload reference is invalid.",
    );
  }
  return value;
}

export function applicationDocumentUploadId(path: unknown, ownerId: string) {
  const value = String(path || "");
  const prefix = `${ownerId}/documents/`;
  if (!UUID.test(ownerId) || !value.startsWith(prefix)) {
    throw new ApplicationDocumentInputError(
      "The supporting-document upload reference is invalid.",
    );
  }
  const uploadId = value.slice(prefix.length, prefix.length + 36);
  verifyApplicationDocumentPath(value, ownerId, uploadId);
  return uploadId;
}

export function applicationDocumentSignatureMatches(
  bytes: Uint8Array,
  mimeType: ApplicationDocumentMimeType,
) {
  if (mimeType === "application/pdf") {
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    );
  }
  if (mimeType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}
