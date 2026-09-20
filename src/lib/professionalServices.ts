/** Null preserves existing all-service behavior. An explicit empty list means
 * no services; malformed assignment data must never widen eligibility. */
export function professionalOffersService(professional: Record<string, unknown>, serviceId: string) {
  if (professional.is_active === false || professional.is_draft === true || professional.archived_at) return false;
  const ids = professional.assigned_service_ids;
  return ids == null || (Array.isArray(ids) && ids.includes(serviceId));
}
