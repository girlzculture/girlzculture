export type DashboardNotificationPollOutcome =
  | "ready"
  | "terminal"
  | "transient";

export const DASHBOARD_NOTIFICATION_POLL_INTERVAL_MS = 60_000;
export const DASHBOARD_NOTIFICATION_MAX_RETRY_MS = 5 * 60_000;

export function nextDashboardNotificationPoll(
  outcome: DashboardNotificationPollOutcome,
  currentAttempt: number,
) {
  if (outcome === "terminal") {
    return { attempt: currentAttempt, delay: null };
  }
  if (outcome === "ready") {
    return {
      attempt: 0,
      delay: DASHBOARD_NOTIFICATION_POLL_INTERVAL_MS,
    };
  }
  const attempt = Math.max(0, currentAttempt) + 1;
  return {
    attempt,
    delay: Math.min(
      DASHBOARD_NOTIFICATION_MAX_RETRY_MS,
      DASHBOARD_NOTIFICATION_POLL_INTERVAL_MS *
        2 ** Math.max(0, attempt - 1),
    ),
  };
}
