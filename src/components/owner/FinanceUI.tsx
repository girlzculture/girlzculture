"use client";
import { cloneElement, isValidElement, useId, type ReactNode, type ReactElement } from "react";
export const financePanel = "rounded-xl border border-plum/10 bg-white p-4 shadow-sm";
export const financeInput = "min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 py-2 text-sm gc-text-primary";
const base = "min-h-10 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50";
export const financeButton = `${base} border-plum/15 bg-white text-plum`;
export const financePrimary = `${base} border-transparent bg-magenta text-white`;
export function FinanceField({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <div className="grid gap-1.5 text-sm font-medium"><label htmlFor={id}>{label}</label>{isValidElement(children) ? cloneElement(children as ReactElement<{ id: string }>, { id }) : children}</div>;
}
export const financeLabels: Record<string,string> = { platform:"Girlz Culture",walk_in:"Walk-in",phone:"Phone",social:"Social media",other:"Other",cash:"Cash",card:"Card",transfer:"Transfer",completed:"Completed",pending:"Pending",cancelled:"Cancelled",deposit:"Deposit",balance:"Balance",full:"Full payment",refund:"Refund",commission:"Commission",employee:"Employee",booth:"Booth rent",none:"No arrangement",wage:"Wages",booth_rent:"Booth rent",week:"Weekly",month:"Monthly",before_discount:"Before discount",after_discount:"After discount" };
