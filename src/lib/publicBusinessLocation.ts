export type PublicBusinessLocation = {
 service_location_type?: string|null; operator_type?: string|null;
 home_address_public?: boolean|null; public_neighborhood?: string|null;
 offers_mobile?: boolean|null; travel_radius_miles?: number|null; travel_fee_cents?: number|null;
 address_street?: string|null; address_line2?: string|null; address_city?: string|null;
 address_state?: string|null; address_zip?: string|null;
 latitude?: number|string|null; longitude?: number|string|null;
};

/** Defense in depth at presentation: even an old cache/fixture with populated
 * private columns must never become a street, directions URL or embedded map. */
export function publicBusinessLocation(value:PublicBusinessLocation) {
 const privateLocation=value.service_location_type==='mobile'||value.service_location_type==='home'&&value.home_address_public!==true;
 const area=[value.public_neighborhood||value.address_city,value.address_state].filter(Boolean).join(', ');
 const address=privateLocation?area:[value.address_street,value.address_line2,value.address_city,value.address_state,value.address_zip].filter(Boolean).join(', ');
 const latitude=value.latitude==null?NaN:Number(value.latitude),longitude=value.longitude==null?NaN:Number(value.longitude);
 const coordinates=Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180;
 const mapQuery=privateLocation?null:coordinates?`${latitude},${longitude}`:value.address_street?address:null;
 const mobile=value.service_location_type==='mobile'||value.offers_mobile===true;
 return {area,address,privateLocation,mapQuery,mobile,independent:value.operator_type==='solo',
  travelRadius:mobile&&Number(value.travel_radius_miles)>0?Number(value.travel_radius_miles):null,
  travelFee:mobile&&Number.isSafeInteger(value.travel_fee_cents)&&Number(value.travel_fee_cents)>=0?Number(value.travel_fee_cents)/100:null};
}
