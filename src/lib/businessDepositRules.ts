/** Booking deposit terms are calculated before any discount and captured once.
 * Incident counts MUST already be verified within this business by the backend. */
export type BusinessDepositRule = {
  version: string | null;
  rate: number;
  threshold_amount: number | null;
  threshold_rate: number | null;
  repeat_incident_count: number | null;
  repeat_incident_rate: number | null;
  incident_window_days: number;
};

export function defaultDepositRule(rate: number): BusinessDepositRule {
  return validateDepositRule({version:null,rate,threshold_amount:null,threshold_rate:null,repeat_incident_count:null,repeat_incident_rate:null,incident_window_days:365});
}

export function validateDepositRule(rule: BusinessDepositRule): BusinessDepositRule {
  const rate = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
  if (!rate(rule.rate) || (rule.threshold_amount === null) !== (rule.threshold_rate === null) || (rule.repeat_incident_count === null) !== (rule.repeat_incident_rate === null)) throw Error("DEPOSIT_RULE_INVALID");
  if (rule.threshold_amount !== null && (!Number.isFinite(rule.threshold_amount) || rule.threshold_amount < 0 || rule.threshold_amount > 10000 || Math.abs(rule.threshold_amount * 100 - Math.round(rule.threshold_amount * 100)) > 0.000001 || !rate(rule.threshold_rate) || rule.threshold_rate! < rule.rate)) throw Error("DEPOSIT_RULE_INVALID");
  if (rule.repeat_incident_count !== null && (!Number.isInteger(rule.repeat_incident_count) || rule.repeat_incident_count < 1 || rule.repeat_incident_count > 100 || !rate(rule.repeat_incident_rate) || rule.repeat_incident_rate! < rule.rate)) throw Error("DEPOSIT_RULE_INVALID");
  if (!Number.isInteger(rule.incident_window_days) || rule.incident_window_days < 1 || rule.incident_window_days > 730) throw Error("DEPOSIT_RULE_INVALID");
  return rule;
}

export function bookingDepositTerms(subtotal: number, rule: BusinessDepositRule, ownVerifiedIncidents = 0) {
  validateDepositRule(rule);
  if (!Number.isFinite(subtotal) || subtotal < 0 || subtotal > 10000 || !Number.isInteger(ownVerifiedIncidents) || ownVerifiedIncidents < 0) throw Error("DEPOSIT_PRICE_INVALID");
  const subtotalCents = Math.round(subtotal * 100);
  const thresholdApplies = rule.threshold_amount !== null && subtotalCents > Math.round(rule.threshold_amount * 100);
  const incidentApplies = rule.repeat_incident_count !== null && ownVerifiedIncidents >= rule.repeat_incident_count;
  // These are alternative minimum rates, not cumulative surcharges.
  const rate = Math.max(rule.rate, thresholdApplies ? rule.threshold_rate! : 0, incidentApplies ? rule.repeat_incident_rate! : 0);
  const rawCents = Math.round(subtotalCents * rate / 100);
  // Existing USD checkout minimum is preserved; tiny deposits are explicitly waived.
  const cents = rawCents > 0 && rawCents < 50 ? 0 : rawCents;
  return {version:rule.version,basis:"eligible_service_subtotal_before_discounts" as const,subtotal:subtotalCents/100,rate,deposit:cents/100,minimum_waived:cents!==rawCents,threshold_applies:thresholdApplies,own_business_protection_applies:incidentApplies,rule:{...rule}};
}

export function protectedBookingDiscount(subtotal: number, deposit: number, requestedSaving: number) {
  if (![subtotal,deposit,requestedSaving].every(value=>Number.isFinite(value)&&value>=0) || deposit>subtotal) throw Error("BOOKING_PRICE_INVALID");
  const original=Math.round(subtotal*100),protectedCents=Math.round(deposit*100);
  const saving=Math.min(original-protectedCents,Math.round(requestedSaving*100));
  return {discount:saving/100,total:(original-saving)/100,deposit:protectedCents/100,balance:(original-saving-protectedCents)/100};
}
