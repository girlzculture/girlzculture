import "server-only";
import type { User } from "@supabase/supabase-js";
import type { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getEngineNumber } from "@/lib/engineConfigServer";
import { bookingDepositTerms, defaultDepositRule, validateDepositRule, type BusinessDepositRule } from "@/lib/businessDepositRules";
type Admin = ReturnType<typeof getSupabaseAdmin>;

export function depositRuleFromRow(row: Record<string, unknown>): BusinessDepositRule {
  const optional = (key:string) => row[key]===null || row[key]===undefined ? null : Number(row[key]);
  return validateDepositRule({version:String(row.id),rate:Number(row.rate),threshold_amount:optional("threshold_amount"),threshold_rate:optional("threshold_rate"),repeat_incident_count:optional("repeat_incident_count"),repeat_incident_rate:optional("repeat_incident_rate"),incident_window_days:Number(row.incident_window_days)});
}

export async function readBusinessDepositRule(admin: Admin, salonId: string) {
  const result=await admin.from("business_deposit_rules").select("id,salon_id,rate,threshold_amount,threshold_rate,repeat_incident_count,repeat_incident_rate,incident_window_days").eq("salon_id",salonId).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(1).maybeSingle();
  if(result.error) throw result.error;
  if(result.data && result.data.salon_id!==salonId) throw Error("DEPOSIT_SCOPE_MISMATCH");
  return result.data ? depositRuleFromRow(result.data) : defaultDepositRule(await getEngineNumber("booking.deposit_percentage",10,0,100));
}

export async function readBookingDepositTerms(admin: Admin, salonId: string, subtotal: number, verifiedUser: User | null) {
  const rule=await readBusinessDepositRule(admin,salonId);
  let count=0;
  if(rule.repeat_incident_count!==null && verifiedUser) {
    // Identity comes from auth.getUser, never a guest_email/customer_id in the body.
    const result=await admin.rpc("own_business_incident_count",{p_salon:salonId,p_customer:verifiedUser.id,p_verified_email:verifiedUser.email_confirmed_at ? verifiedUser.email || null : null,p_days:rule.incident_window_days});
    if(result.error) throw result.error;
    if(!Number.isInteger(result.data) || result.data<0) throw Error("DEPOSIT_INCIDENTS_UNAVAILABLE");
    count=result.data;
  }
  return bookingDepositTerms(subtotal,rule,count);
}
