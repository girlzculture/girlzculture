import {
  ALLOWED_HEX,
  ALLOWED_RGB,
  auditRepository,
  formatViolations,
} from "./lib/launch-design-system-audit.mjs";

const result = auditRepository();

if (result.violations.length) {
  process.stderr.write(
    `Launch design-system audit failed with ${result.violations.length} violation(s):\n${formatViolations(result.violations)}\n`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Launch design-system audit passed (${result.filesScanned} source assets; ${ALLOWED_HEX.size} documented color literals and ${ALLOWED_RGB.size} documented RGB roles).`,
  );
}
