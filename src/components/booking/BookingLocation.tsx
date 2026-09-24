"use client";
import {useState,useRef,useEffect} from "react";
import {createAuthenticatedApiClient} from "@/lib/scopedApiClient";
import {getSupabaseForScope} from "@/lib/supabase";
import {readApiResponse} from "@/lib/apiResponseClient";
import {useI18n} from "@/components/i18n/LocaleProvider";
type Location={location_type:string;address_street?:string|null;address_line2?:string|null;address_city?:string|null;address_state?:string|null;address_zip?:string|null;public_neighborhood?:string|null;travel_radius_miles?:number|null;revealed_after_confirmation:boolean};
// A record change must unmount the private address as well as invalidate its
// request. An effect-only reset would display the previous address for a frame.
export default function BookingLocation(props:{bookingId:string;guestToken?:string}){
 return <BookingLocationRecord key={`${props.bookingId}:${props.guestToken||"customer"}`} {...props}/>;
}
function BookingLocationRecord({bookingId,guestToken}:{bookingId:string;guestToken?:string}){
 const {translateSource:t}=useI18n();const [location,setLocation]=useState<Location|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const version=useRef(0);
 useEffect(()=>{if(guestToken)return;const requestVersion=version;let actor:string|null|undefined;const auth=getSupabaseForScope("customer").auth.onAuthStateChange((_event,session)=>{const next=session?.user.id||null;if(actor!==undefined&&actor!==next){version.current++;setLocation(null);setError("");setBusy(false);}actor=next;});return()=>{requestVersion.current++;auth.data.subscription.unsubscribe();};},[guestToken]);
 async function load(){if(busy)return;setBusy(true);setError("");const current=version.current;
  try{let body:Record<string,unknown>;
   if(guestToken){const response=await fetch(`/api/customer/bookings/${bookingId}/location`,{headers:{"x-guest-booking-token":guestToken},cache:"no-store",signal:AbortSignal.timeout(15000)});body=await readApiResponse(response,t("Your booking location could not be loaded."));if(!response.ok)throw new Error(String(body.error||t("Your booking location could not be loaded."))+(body.request_id?` (${body.request_id})`:""));}
   else body=await(await createAuthenticatedApiClient("customer")).request(`/api/customer/bookings/${bookingId}/location`,{signal:AbortSignal.timeout(15000)});
   if(current===version.current)setLocation(body.location as Location);
  }catch(failure){if(current===version.current)setError(failure instanceof Error?failure.message:t("Your booking location could not be loaded."));}
  finally{if(current===version.current)setBusy(false);}
 }
 return <section className="rounded-xl border border-border bg-white p-4"><h3 className="font-semibold">{t("Appointment location")}</h3>{location?<div className="mt-2 text-sm">{location.location_type==="mobile"&&!location.address_street?<p>{t("This professional travels to you. Confirm your meeting address in your booking conversation.")}</p>:location.address_street?<><p data-no-translate>{[location.address_street,location.address_line2,location.address_city,location.address_state,location.address_zip].filter(Boolean).join(", ")}</p>{location.revealed_after_confirmation?<p className="mt-2 text-xs">{t("This private address is shared for your confirmed appointment.")}</p>:null}</>:<><p data-no-translate>{location.public_neighborhood||location.address_city}</p><p className="mt-2">{t("The exact address is available after your booking is confirmed.")}</p></>}</div>:null}{error?<p role="alert" className="mt-2 text-sm gc-text-danger">{error}</p>:null}<button type="button" disabled={busy} onClick={()=>void load()} className="mt-2 min-h-11 font-semibold text-magenta">{t(busy?"Loading…":location?"Refresh location":"View appointment location")}</button></section>;
}
