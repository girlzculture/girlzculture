export type TeamMutationRollbackAction = {
  name: string;
  run: () => Promise<void>;
};

export type TeamMutationRollbackOutcome = {
  complete: boolean;
  failedSteps: string[];
};

export class TeamMutationRollbackError extends Error {
  readonly code = "TEAM_MUTATION_ROLLBACK_FAILED";
  readonly failedSteps: string[];

  constructor(failedSteps: string[], cause: unknown) {
    super(
      "The team-member update failed and automatic rollback requires administrator review.",
      { cause },
    );
    this.name = "TeamMutationRollbackError";
    this.failedSteps = [...failedSteps];
  }
}

async function attempt(action: TeamMutationRollbackAction) {
  try {
    await action.run();
    return true;
  } catch {
    return false;
  }
}

/**
 * Restores every surface touched by a failed team-member edit. Cleanup steps
 * are independent, so one failure never prevents the remaining state from
 * being restored. Transient cleanup and audit failures receive one retry.
 *
 * The helper always throws after rollback: a complete rollback preserves the
 * original operation error, while incomplete cleanup raises a safe error with
 * only operator-searchable step names.
 */
export async function compensateFailedTeamMutation({
  cause,
  actions,
  audit,
}: {
  cause: unknown;
  actions: TeamMutationRollbackAction[];
  audit: (outcome: TeamMutationRollbackOutcome) => Promise<void>;
}): Promise<never> {
  let failed = [] as TeamMutationRollbackAction[];

  for (const action of actions) {
    if (!(await attempt(action))) failed.push(action);
  }

  if (failed.length) {
    const retryFailures = [] as TeamMutationRollbackAction[];
    for (const action of failed) {
      if (!(await attempt(action))) retryFailures.push(action);
    }
    failed = retryFailures;
  }

  const failedSteps = failed.map((action) => action.name);
  const outcome = {
    complete: failedSteps.length === 0,
    failedSteps: [...failedSteps],
  };
  const auditAction: TeamMutationRollbackAction = {
    name: "rollback_audit",
    run: () => audit(outcome),
  };
  const auditComplete = (await attempt(auditAction)) || (await attempt(auditAction));
  if (!auditComplete) failedSteps.push(auditAction.name);

  if (failedSteps.length) {
    throw new TeamMutationRollbackError(failedSteps, cause);
  }
  if (cause instanceof Error) throw cause;
  throw new Error("TEAM_MUTATION_FAILED", { cause });
}
