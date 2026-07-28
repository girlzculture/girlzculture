export type PublicationCheck = {
  label?: unknown;
  required?: unknown;
  passed?: unknown;
  overridden?: unknown;
  effective_passed?: unknown;
};

export type PublicationDiagnostic = {
  checks?: unknown;
  effective_missing_gate_labels?: unknown;
  missing_gate_labels?: unknown;
  all_required_complete?: unknown;
  actual_required_complete?: unknown;
  profile_public?: unknown;
  publication_state?: unknown;
  override_active?: unknown;
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];
}

export function publicationGateFailures(
  diagnostic: PublicationDiagnostic | null | undefined,
  mode: "effective" | "actual" = "effective",
) {
  const declared = mode === "effective"
    ? stringList(diagnostic?.effective_missing_gate_labels)
    : stringList(diagnostic?.missing_gate_labels);
  if (declared.length) return declared;

  if (
    !diagnostic?.checks ||
    typeof diagnostic.checks !== "object" ||
    Array.isArray(diagnostic.checks)
  ) {
    return [];
  }

  return Object.values(
    diagnostic.checks as Record<string, PublicationCheck>,
  )
    .filter((check) => {
      if (check.required !== true) return false;
      return mode === "actual"
        ? check.passed !== true
        : (check.effective_passed ?? check.passed) !== true;
    })
    .map((check) => String(check.label || "Marketplace requirement"));
}

export function publicationOverriddenGateLabels(
  diagnostic: PublicationDiagnostic | null | undefined,
) {
  if (
    !diagnostic?.checks ||
    typeof diagnostic.checks !== "object" ||
    Array.isArray(diagnostic.checks)
  ) {
    return [];
  }

  return Object.values(
    diagnostic.checks as Record<string, PublicationCheck>,
  )
    .filter((check) => check.overridden === true)
    .map((check) => String(check.label || "Marketplace requirement"));
}

export function publicationBlockMessage(missing: string[]) {
  return missing.length
    ? `This salon is not public yet. Complete: ${missing.join(", ")}.`
    : "This salon is not public yet. Review its lifecycle state before retrying.";
}

export function pilotOverrideReasonError(reason: unknown) {
  return String(reason || "").trim().length >= 12
    ? null
    : "Enter an override reason of at least 12 characters.";
}
