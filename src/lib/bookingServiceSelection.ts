/** Shared by checkout and read-only assistant calculation. Inputs identify
 * saved choices; prices always come from the authoritative service/material. */
type Row = Record<string, unknown>;
export type BookingServiceSelection = { selected_size: string | null; selected_length: string | null; selected_addons: string[]; selected_options: Record<string, string[]>; selected_material_id: string | null };
export class ServiceSelectionError extends Error {
  constructor(public code: "selection_unavailable" | "selection_duplicate" | "selection_required" | "price_unavailable", public group_id: string | null = null, public group_label: string | null = null) {
    super(code === "selection_required" ? `Choose ${group_label || "a required service option"}.` : code === "selection_duplicate" ? "Choose each service option only once." : code === "price_unavailable" ? "The booking total could not be verified." : "A selected service option is no longer available.");
  }
}
const fail = () => new ServiceSelectionError("selection_unavailable");
const rows = (value: unknown): Row[] => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== "object" || Array.isArray(item))) throw fail();
  return value;
};
const amount = (value: unknown) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) throw new ServiceSelectionError("price_unavailable");
  return number;
};
export function calculateBookingServiceSelection(style: Row, selection: BookingServiceSelection, material: Row | null = null) {
  const lines: { kind: string; name: string; amount_before_rounding: number }[] = [];
  // Preserve the existing checkout fallback and round the final subtotal once.
  let total = amount(style.base_price || style.price_display_min || 0);
  lines.push({ kind: "service", name: String(style.name || "Service"), amount_before_rounding: total });
  const choose = (source: unknown, values: string[], kind: string) => {
    const options = rows(source), used = new Set<number>();
    return values.map((value): Row & { price: number; selected_value: string } => {
      const matches = options.flatMap((option, index) => option.value === value || option.label === value ? [index] : []);
      if (!value || matches.length !== 1) throw fail();
      const index = matches[0], option = options[index];
      if (used.has(index)) throw new ServiceSelectionError("selection_duplicate");
      used.add(index);
      const price = amount(option.price_add);
      total += price;
      lines.push({ kind, name: String(option.label || option.value), amount_before_rounding: price });
      return { ...option, price, selected_value: value };
    });
  };
  choose(style.size_options, selection.selected_size ? [selection.selected_size] : [], "size");
  choose(style.length_options, selection.selected_length ? [selection.selected_length] : [], "length");
  const addons = choose(style.addons, selection.selected_addons, "addon");
  const groups = rows(style.option_groups);
  if (Object.keys(selection.selected_options).some(id => !groups.some(group => group.id === id))) throw fail();
  let duration = 0;
  for (const group of groups) {
    if (typeof group.id !== "string" || !group.id || groups.filter(other => other.id === group.id).length !== 1) throw fail();
    const values = selection.selected_options[group.id] || [];
    if (group.required && !values.length) throw new ServiceSelectionError("selection_required", group.id, typeof group.label === "string" ? group.label : null);
    if (group.selection !== "multiple" && values.length > 1) throw fail();
    for (const option of choose(group.options, values, "option")) duration += amount(option.duration_add_minutes);
  }
  if (selection.selected_material_id) {
    if (!material || material.id !== selection.selected_material_id || material.style_id !== style.id) throw fail();
    const price = amount(material.price);
    total += price;
    lines.push({ kind: "material", name: String(material.name || "Material"), amount_before_rounding: price });
  }
  total = Math.max(0, Math.round(total * 100) / 100);
  if (!Number.isFinite(total) || total > 10000) throw new ServiceSelectionError("price_unavailable");
  return { subtotal: total, duration_adjustment_minutes: duration, lines,
    selected_addons: addons.map(option => ({ value: option.selected_value, label: String(option.label || option.selected_value), price: option.price })) };
}
