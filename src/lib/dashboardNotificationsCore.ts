export type NotificationRow = {
  id?: string;
  read_at?: string | null;
  category?: string;
};

export function dashboardNotificationCounts(rows: NotificationRow[]) {
  return rows.reduce<Record<string, number>>((result, row) => {
    if (!row.read_at) {
      const category = row.category || "general";
      result[category] = (result[category] || 0) + 1;
    }
    return result;
  }, {});
}

export function markDashboardNotificationsRead<T extends NotificationRow>(
  rows: T[],
  action: "read" | "read_all",
  readAt: string,
  id?: string,
) {
  return rows.map((row) =>
    action === "read_all" || row.id === id ? { ...row, read_at: readAt } : row,
  );
}
