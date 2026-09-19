/** Read-only response shape, shared with the owner view without server imports. */
export type CapacityOptionGroup = { id: string; label: string; required: boolean; multiple: boolean; options: { value: string; label: string; duration_minutes: number }[] };
export type ServiceCapacity = {
  available: boolean; reason: "selection_required" | "selection_unavailable" | null;
  service_id: string; service_name: string; date: string; through: string; time_zone: string; as_of: string;
  duration_minutes: number | null; duration_basis: "maximum_saved_duration" | "fixed_saved_duration";
  buffer_minutes: number | null; option_groups: CapacityOptionGroup[];
  total: number | null; shown_count: number; is_excerpt: boolean;
  days: { date: string; total: number }[];
  slots: { date: string; time: string; stylist_id: string | null; professional_name: string | null; href: string }[];
  definition: string;
};
export function serviceCapacityAssistantFacts(value: unknown) {
  if (!value || typeof value !== "object" || !("service_id" in value)) return value;
  const result = value as ServiceCapacity;
  // Keep each start flat enough to survive the existing model depth/array bound.
  return { ...result, shown_count: Math.min(result.slots.length, 12), is_excerpt: result.is_excerpt || result.slots.length > 12,
    slots: result.slots.slice(0, 12),
    option_groups: result.option_groups.map(group => ({ id: group.id, label: group.label, required: group.required, multiple: group.multiple,
      choices: group.options.map(option => `${option.value}: ${option.label}; duration adjustment ${option.duration_minutes} minutes`),
    })),
  };
}
