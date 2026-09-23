export type BusinessLocationSettings = { service_location_type: "storefront"|"chair_suite"|"home"|"mobile"|null; home_address_public:boolean;public_neighborhood:string|null;offers_mobile:boolean;travel_radius_miles:number|null;travel_fee_cents:number;revision:number };
export class LocationSettingsError extends Error {}
export function locationSettingsInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LocationSettingsError("Review your location settings.");
  const input=value as Record<string,unknown>;
  if (Object.keys(input).some(key=>!["revision","home_address_public","public_neighborhood","offers_mobile","travel_radius_miles","travel_fee_cents"].includes(key)) || !Number.isSafeInteger(input.revision) || Number(input.revision)<1 || typeof input.home_address_public!=="boolean" || typeof input.offers_mobile!=="boolean" || typeof input.public_neighborhood!=="string" || input.public_neighborhood.length>120) throw new LocationSettingsError("Review your location settings.");
  if (input.travel_radius_miles!==null && (typeof input.travel_radius_miles!=="number" || !Number.isFinite(input.travel_radius_miles) || input.travel_radius_miles<1 || input.travel_radius_miles>100)) throw new LocationSettingsError("Enter a travel radius from 1 to 100 miles.");
  if (!Number.isSafeInteger(input.travel_fee_cents) || Number(input.travel_fee_cents)<0 || Number(input.travel_fee_cents)>100000) throw new LocationSettingsError("Enter a travel fee from $0 to $1,000.");
  const { revision,...settings }=input;
  return { revision,settings };
}
