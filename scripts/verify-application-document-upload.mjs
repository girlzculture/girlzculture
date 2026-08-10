import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");

async function importTypeScript(path) {
  const output = ts.transpileModule(read(path), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
  );
}

const component = read("src/components/SalonApplication.tsx");
const prepare = read(
  "src/app/api/salon/application/documents/prepare/route.ts",
);
const finalize = read(
  "src/app/api/salon/application/documents/finalize/route.ts",
);
const abandon = read(
  "src/app/api/salon/application/documents/abandon/route.ts",
);
const applicationRoute = read("src/app/api/salon/application/route.ts");
const cleanupRoute = read("src/app/api/media/cleanup/route.ts");
const integrityMigration = read(
  "supabase/migrations/20260809160000_application_document_upload_integrity.sql",
);
const integrityPreflight = read(
  "scripts/sql/preflight-application-document-upload-integrity.sql",
);
const storageMigration = read(
  "supabase/migrations/20260715200000_storage_policy_qualification.sql",
);

assert.ok(
  component.includes("/api/salon/application/documents/prepare") &&
    component.includes("/api/salon/application/documents/finalize") &&
    component.includes("/api/salon/application/documents/abandon") &&
    component.includes("uploadToSignedUrl") &&
    component.includes("readApiResponse") &&
    component.includes("reportClientOperationalFailure") &&
    component.includes('body: JSON.stringify({ path: preparedPath })'),
  "application documents must use authenticated prepare, signed transfer, safe parsing, monitored transfer failure, and finalization",
);
assert.ok(
  !component.includes('.from("application-documents").upload(') &&
    !component.includes("transfer.error.message") &&
    !component.includes("setMessage(error.message)"),
  "the application form must not use the raw storage insert or expose its provider error message",
);
for (const [source, action] of [
  [prepare, "prepare-upload"],
  [finalize, "finalize-upload"],
]) {
  assert.ok(
    source.includes('.from("salons")') &&
      source.includes('.eq("user_id",') &&
      source.includes("monitoredRouteFailure") &&
      source.includes(`action: "${action}"`) &&
      source.includes('feature: "salon-application-documents"') &&
      source.includes('provider: "supabase-storage"') &&
      source.includes("actorId") &&
      source.includes("salonId") &&
      source.includes("recordId: uploadId"),
    `${action} must authenticate the salon applicant and correlate unexpected storage failures to Engine context`,
  );
}
assert.ok(
  abandon.includes('.from("salons")') &&
    abandon.includes('.eq("user_id", actorId)') &&
    abandon.includes("monitoredRouteFailure") &&
    abandon.includes('action: "abandon-upload"') &&
    abandon.includes('feature: "salon-application-documents"') &&
    abandon.includes("actorId") &&
    abandon.includes("salonId") &&
    abandon.includes("recordId: uploadId"),
  "abandon-upload must authenticate ownership and correlate unexpected persistence failures",
);
assert.ok(
  prepare.includes("createSignedUploadUrl") &&
    prepare.includes("applicationDocumentPath") &&
    prepare.includes('rpc("prepare_application_document_upload"') &&
    prepare.indexOf('rpc("prepare_application_document_upload"') <
      prepare.indexOf("createSignedUploadUrl"),
  "the server must durably prepare the applicant-owned path before signing it",
);
assert.ok(
  finalize.includes("verifyApplicationDocumentPath") &&
    finalize.includes(".list(folder") &&
    finalize.includes(".download(path)") &&
    finalize.includes("storedBlob.size !== descriptor.sizeBytes") &&
    finalize.includes("applicationDocumentSignatureMatches"),
  "finalization must verify ownership, stored metadata, bytes, and file signature",
);
assert.ok(
  finalize.includes('rpc("finalize_application_document_upload"') &&
    abandon.includes('rpc("abandon_application_document_upload"') &&
    component.includes("removeDocument(path)"),
  "verified uploads and explicit removal must transition the durable registry",
);
assert.ok(
  applicationRoute.includes("applicationDocumentPaths") &&
    applicationRoute.includes('path.startsWith(`${userId}/documents/`)'),
  "application submission must retain the applicant-owned document path boundary",
);
assert.ok(
  integrityMigration.includes("create table if not exists public.application_document_uploads") &&
    integrityMigration.includes("prepare_application_document_upload") &&
    integrityMigration.includes("finalize_application_document_upload") &&
    integrityMigration.includes("abandon_application_document_upload") &&
    integrityMigration.includes("enforce_application_document_attachments") &&
    integrityMigration.includes("Upload and verify every supporting document before submitting.") &&
    integrityMigration.includes("pg_advisory_xact_lock") &&
    integrityMigration.includes("status in ('Prepared','Finalized')") &&
    integrityMigration.includes("status='Attached'") &&
    integrityMigration.includes("enable row level security") &&
    integrityMigration.includes("revoke all on public.application_document_uploads") &&
    integrityMigration.includes("on delete set null") &&
    integrityMigration.includes("set search_path = pg_catalog, public") &&
    integrityMigration.includes("assigned to more than one application"),
  "the database must enforce a private, locked prepare/finalize/attach state machine",
);
assert.ok(
  integrityPreflight.includes("count(distinct application.id) > 1") &&
    integrityPreflight.includes("application.user_id is null") &&
    integrityPreflight.includes("position('..' in document_path) > 0") &&
    integrityPreflight.includes("'/documents/[0-9a-f]{8}") &&
    !/\b(update|delete|insert|truncate|alter|create|drop|grant|revoke)\b/i.test(
      integrityPreflight,
    ),
  "the operator preflight must report the migration's duplicate and ownership failures without mutating data",
);
assert.ok(
  cleanupRoute.includes('.from("application_document_uploads")') &&
    cleanupRoute.includes('.from("application-documents")') &&
    cleanupRoute.includes("expired_application_documents_cleaned") &&
    cleanupRoute.includes("runIsolatedCleanupBatch"),
  "the bounded scheduled media cleanup must remove expired or abandoned application documents",
);
assert.ok(
  storageMigration.includes("bucket_id = 'application-documents'") &&
    storageMigration.includes(
      "(storage.foldername(storage.objects.name))[1] = auth.uid()::text",
    ),
  "the private bucket must retain its authenticated owner-folder RLS boundary",
);

const core = await importTypeScript(
  "src/lib/applicationDocumentUploadCore.ts",
);
const ownerId = "123e4567-e89b-42d3-a456-426614174000";
const uploadId = "123e4567-e89b-42d3-a456-426614174001";
assert.deepEqual(
  core.applicationDocumentDescriptor({
    file_name: "License (final).pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
  }),
  {
    fileName: "License-final-.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
  },
);
assert.throws(
  () =>
    core.applicationDocumentDescriptor({
      file_name: "unsafe.svg",
      mime_type: "image/svg+xml",
      size_bytes: 100,
    }),
  /PDF, JPG, or PNG/i,
);
assert.throws(
  () =>
    core.applicationDocumentDescriptor({
      file_name: "too-large.pdf",
      mime_type: "application/pdf",
      size_bytes: 10 * 1024 * 1024 + 1,
    }),
  /10 MB/i,
);
const path = core.applicationDocumentPath(
  ownerId,
  uploadId,
  "../../private license.pdf",
);
assert.equal(
  path,
  `${ownerId}/documents/${uploadId}-private-license.pdf`,
);
assert.equal(
  core.verifyApplicationDocumentPath(path, ownerId, uploadId),
  path,
);
assert.equal(core.applicationDocumentUploadId(path, ownerId), uploadId);
assert.throws(
  () =>
    core.verifyApplicationDocumentPath(
      path.replace(ownerId, "123e4567-e89b-42d3-a456-426614174099"),
      ownerId,
      uploadId,
    ),
  /reference is invalid/i,
);
assert.equal(
  core.applicationDocumentSignatureMatches(
    Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
    "application/pdf",
  ),
  true,
);
assert.equal(
  core.applicationDocumentSignatureMatches(
    Uint8Array.from([0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]),
    "application/pdf",
  ),
  false,
);
assert.equal(
  core.applicationDocumentSignatureMatches(
    Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
    "image/jpeg",
  ),
  true,
);
assert.equal(
  core.applicationDocumentSignatureMatches(
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "image/png",
  ),
  true,
);

console.log(
  "Verified applicant-owned signed document upload, server finalization, byte signatures, and correlated sanitized failures.",
);
