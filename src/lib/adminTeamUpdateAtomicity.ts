export type AdminTeamUpdateStep = {
  name: string;
  apply: () => Promise<void>;
  compensate: () => Promise<void>;
};

export type AdminTeamUpdateCompensationOutcome = {
  complete: boolean;
  failedSteps: string[];
};

export class AdminTeamUpdateCompensationError extends Error {
  readonly code = "ADMIN_TEAM_UPDATE_COMPENSATION_FAILED";
  readonly failedSteps: string[];

  constructor(failedSteps: string[], cause: unknown) {
    super(
      "The administrator update failed and automatic cleanup requires administrator review.",
      { cause },
    );
    this.name = "AdminTeamUpdateCompensationError";
    this.failedSteps = [...failedSteps];
  }
}

async function attempt(action: () => Promise<void>) {
  try {
    await action();
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a cross-provider administrator update as a compensating transaction.
 *
 * Database authorization is changed before Auth so every intermediate state
 * remains fail-closed. If a later step fails, completed steps are compensated
 * in reverse order. Each failed compensation is retried once, and the caller
 * must persist a sanitized compensation audit before the original failure is
 * allowed to escape.
 */
export async function runCompensatedAdminTeamUpdate({
  steps,
  auditCompensation,
}: {
  steps: AdminTeamUpdateStep[];
  auditCompensation: (
    outcome: AdminTeamUpdateCompensationOutcome,
  ) => Promise<void>;
}) {
  const applied: AdminTeamUpdateStep[] = [];
  try {
    for (const step of steps) {
      await step.apply();
      applied.push(step);
    }
  } catch (cause) {
    let failed = [] as AdminTeamUpdateStep[];
    for (const step of [...applied].reverse()) {
      if (!(await attempt(step.compensate))) failed.push(step);
    }
    if (failed.length) {
      const retryFailures = [] as AdminTeamUpdateStep[];
      for (const step of failed) {
        if (!(await attempt(step.compensate))) retryFailures.push(step);
      }
      failed = retryFailures;
    }

    const failedSteps = failed.map((step) => step.name);
    const outcome = {
      complete: failedSteps.length === 0,
      failedSteps: [...failedSteps],
    };
    const auditComplete =
      (await attempt(() => auditCompensation(outcome))) ||
      (await attempt(() => auditCompensation(outcome)));
    if (!auditComplete) failedSteps.push("compensation_audit");

    if (failedSteps.length) {
      throw new AdminTeamUpdateCompensationError(failedSteps, cause);
    }
    if (cause instanceof Error) throw cause;
    throw new Error("ADMIN_TEAM_UPDATE_FAILED", { cause });
  }
}
