import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing expected source in ${path}: ${before.slice(0, 120)}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Expected one source match in ${path}`);
  writeFileSync(path, source.slice(0, index) + after + source.slice(index + before.length));
}

function replaceRange(path, startToken, endToken, replacement) {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`Unable to find replacement range in ${path}`);
  writeFileSync(path, source.slice(0, start) + replacement + source.slice(end));
}

const path = "src/components/admin/AdminRecordWorkspace.tsx";
replaceOnce(
  path,
  `import AdminBookingEditor from "@/components/admin/AdminBookingEditor";`,
  `import AdminBookingEditor from "@/components/admin/AdminBookingEditor";\nimport AdminManualBookingWizard from "@/components/admin/AdminManualBookingWizard";`,
);
replaceRange(
  path,
  "function ManualBooking(",
  "function Field(",
  `function ManualBooking({ salons, onCreated }: { salons: Row[]; onCreated: () => Promise<void> }) {\n  return <AdminManualBookingWizard salons={salons} onCreated={onCreated}/>;\n}\n\n`,
);
console.log("Admin manual booking wizard wired into the focused booking workspace.");