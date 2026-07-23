import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export type ReportedOperationalFailure = {
  error: unknown;
  operation: string;
};

type OperationalStore = {
  failures: ReportedOperationalFailure[];
};

const operationalStore = new AsyncLocalStorage<OperationalStore>();

function normalizeFailure(values: unknown[]): ReportedOperationalFailure {
  const label = values.find((value) => typeof value === "string");
  let error: unknown = values.find((value) => value instanceof Error);
  if (!error) {
    for (const value of values) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Record<string, unknown>;
      const candidate = record.error
        || record.providerError
        || record.deliveryError
        || Object.entries(record).find(([key]) => /error$/i.test(key))?.[1]
        || (typeof record.message === "string" || typeof record.code === "string"
          ? record
          : null);
      if (candidate) {
        error = candidate;
        break;
      }
    }
  }
  return {
    error: error || new Error("REPORTED_OPERATION_FAILURE"),
    operation: String(label || "Reported operational failure")
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email redacted]")
      .replace(/[\u0000-\u001f]/g, " ")
      .slice(0, 160),
  };
}

export function noteOperationalFailure(...values: unknown[]) {
  const store = operationalStore.getStore();
  if (!store) return false;
  store.failures.push(normalizeFailure(values));
  return true;
}

export function runWithOperationalContext<T>(callback: () => T) {
  return operationalStore.run({ failures: [] }, callback);
}

export function operationalFailures() {
  return operationalStore.getStore()?.failures || [];
}

export function hasOperationalContext() {
  return Boolean(operationalStore.getStore());
}
