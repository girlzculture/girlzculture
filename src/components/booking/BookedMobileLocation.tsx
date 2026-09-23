"use client";
import {useI18n} from "@/components/i18n/LocaleProvider";
export default function BookedMobileLocation({snapshot}:{snapshot:unknown}){
 const {translateSource:t,formatCurrency}=useI18n();
 if(!snapshot||typeof snapshot!=="object")return null;
 const row=snapshot as Record<string,unknown>;if(row.mode!=="mobile"||!row.address||typeof row.address!=="object")return null;
 const a=row.address as Record<string,unknown>;
 const address=["address_street","address_line2","address_city","address_state","address_zip"].map(key=>typeof a[key]==="string"?a[key]:"").filter(Boolean).join(", ");
 return <section className="my-4 rounded-xl border border-border p-4"><h3 className="font-semibold">{t("Appointment location")}</h3><p data-no-translate className="mt-2 text-sm">{address}</p><p className="mt-2 text-sm">{t("Travel fee: {value0}",{value0:formatCurrency(Number(row.travel_fee_cents||0)/100)})}</p></section>;
}
