import "server-only";
import {timingSafeEqual} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {protectedHmac} from "@/lib/guestBookingTokenCore";
import {communicationUuid,type CommunicationChoices} from "@/lib/businessCommunicationCore";

type BookingIdentity={id:string;salon_id:string;customer_id?:string|null;preferred_locale?:string|null};
export async function bookingCommunicationPreferences(admin:SupabaseClient,booking:BookingIdentity):Promise<CommunicationChoices&{id?:string}>{
 const columns="id,email_enabled,sms_enabled,push_enabled,reminders,follow_up,marketing,locale,consent_version";
 const [guest,customer]=await Promise.all([
  admin.from("business_communication_preferences").select(columns).eq("salon_id",booking.salon_id).eq("guest_booking_id",booking.id).maybeSingle(),
  booking.customer_id?admin.from("business_communication_preferences").select(columns).eq("salon_id",booking.salon_id).eq("customer_id",booking.customer_id).maybeSingle():Promise.resolve({data:null,error:null}),
 ]);
 if(guest.error)throw guest.error;if(customer.error)throw customer.error;
 return guest.data||customer.data||{email_enabled:true,sms_enabled:true,push_enabled:true,reminders:true,follow_up:false,marketing:false,locale:["en","fr","es","zh-CN"].includes(booking.preferred_locale||"")?booking.preferred_locale!:"en",consent_version:1};
}
function unsubscribeSecret(){const secret=process.env.GUEST_BOOKING_LINK_SECRET||process.env.INTERNAL_API_SECRET||process.env.MFA_CODE_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret||secret.length<32)throw Error("COMMUNICATION_SIGNING_UNAVAILABLE");return secret;}
// Narrow opt-out capability: cannot read records, opt in, or act on a booking.
export function communicationUnsubscribeToken(preferenceId:string){if(!communicationUuid.test(preferenceId))throw Error("COMMUNICATION_INVALID");return `${preferenceId}.${protectedHmac(`business-communication-opt-out:${preferenceId}`,unsubscribeSecret())}`;}
export function verifyCommunicationUnsubscribeToken(token:unknown){
 if(typeof token!=="string"||token.length>110)return null;
 const [id,signature,extra]=token.split(".");if(!communicationUuid.test(id)||!signature||extra)return null;
 const expected=communicationUnsubscribeToken(id).split(".")[1];const a=Buffer.from(signature),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b)?id:null;
}
