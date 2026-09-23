export type TravelAddress = {address_street:string;address_line2:string;address_city:string;address_state:string;address_zip:string};
export type TravelQuote = {id:string;address:TravelAddress;fee_cents:number;expires_at:string};
export class TravelBookingError extends Error {
  constructor(public code:string, public status=400){super(code);}
}
export function travelAddress(value:unknown):TravelAddress{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new TravelBookingError("TRAVEL_ADDRESS_INVALID");
  const row=value as Record<string,unknown>;
  const limits={address_street:160,address_line2:100,address_city:100,address_state:2,address_zip:10};
  if(Object.keys(row).some(k=>!Object.hasOwn(limits,k)))throw new TravelBookingError("TRAVEL_ADDRESS_INVALID");
  const result={} as TravelAddress;
  for(const [key,max]of Object.entries(limits)){
    const val=row[key];
    if(typeof val!=="string"||val.trim().length>max||key!=="address_line2"&&!val.trim())throw new TravelBookingError("TRAVEL_ADDRESS_INVALID");
    result[key as keyof TravelAddress]=val.trim();
  }
  if(!/^[A-Z]{2}$/.test(result.address_state)||!/^\d{5}(?:-\d{4})?$/.test(result.address_zip))throw new TravelBookingError("TRAVEL_ADDRESS_INVALID");
  return result;
}
/** Travel is separate from the service discount and its protected deposit. */
export function totalWithTravel(serviceTotal:number,feeCents:number){
  if(!Number.isFinite(serviceTotal)||serviceTotal<0||!Number.isSafeInteger(feeCents)||feeCents<0||feeCents>100000)throw new TravelBookingError("TRAVEL_TERMS_CHANGED",409);
  return (Math.round(serviceTotal*100)+feeCents)/100;
}
