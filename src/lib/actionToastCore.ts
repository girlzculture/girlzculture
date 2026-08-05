export const ACTION_TOAST_SUCCESS_DURATION_MS = 5_000;

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

export function actionToastIsError(message: string) {
  return /fail|unable|could not|couldn't|error|invalid|expired|needs? attention|not saved|reference\s+[0-9a-f-]{36}/i.test(
    message,
  );
}

export function actionToastReference(message: string) {
  return message.match(UUID_PATTERN)?.[0] || "";
}
