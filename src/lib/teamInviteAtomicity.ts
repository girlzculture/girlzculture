export type InvitationCompensationAction = {
  name: string;
  run: () => Promise<void>;
};

export type InvitationCompensationOutcome = {
  complete: boolean;
  failedSteps: string[];
};

export class TeamInvitationCompensationError extends Error {
  readonly code = "TEAM_INVITATION_COMPENSATION_FAILED";
  readonly failedSteps: string[];

  constructor(failedSteps: string[], cause: unknown) {
    super("The invitation failed and automatic cleanup requires administrator review.", {
      cause,
    });
    this.name = "TeamInvitationCompensationError";
    this.failedSteps = [...failedSteps];
  }
}

async function attempt(action: InvitationCompensationAction) {
  try {
    await action.run();
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs every compensating action even when another cleanup step fails. Failed
 * actions are retried once after the rest of the authorization surface has
 * been removed/restored. The audit callback is also required and retried once.
 *
 * This helper always throws: callers use it only while unwinding a failed
 * invitation. When compensation succeeds, the original operation error is
 * preserved. When cleanup is incomplete, callers receive a sanitized error
 * containing only safe step names while the original error remains its cause.
 */
export async function compensateFailedInvitation({
  cause,
  actions,
  audit,
}: {
  cause: unknown;
  actions: InvitationCompensationAction[];
  audit: (outcome: InvitationCompensationOutcome) => Promise<void>;
}): Promise<never> {
  let failed = [] as InvitationCompensationAction[];

  for (const action of actions) {
    if (!(await attempt(action))) failed.push(action);
  }

  if (failed.length) {
    const retryFailures = [] as InvitationCompensationAction[];
    for (const action of failed) {
      if (!(await attempt(action))) retryFailures.push(action);
    }
    failed = retryFailures;
  }

  const failedSteps = failed.map((action) => action.name);
  const outcome = { complete: failedSteps.length === 0, failedSteps };
  const auditAction: InvitationCompensationAction = {
    name: "compensation_audit",
    run: () => audit(outcome),
  };
  const auditComplete = (await attempt(auditAction)) || (await attempt(auditAction));
  if (!auditComplete) failedSteps.push(auditAction.name);

  if (failedSteps.length) {
    throw new TeamInvitationCompensationError(failedSteps, cause);
  }
  if (cause instanceof Error) throw cause;
  throw new Error("TEAM_INVITATION_FAILED", { cause });
}
