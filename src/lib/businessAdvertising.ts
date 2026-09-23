export type AdQuote={id:string;title:string;starts_at:string;ends_at:string;radius_miles:number;plan:string;price_cents:number;discount_percent:number;discount_cents:number;credit_cents:number;balance_cents:number;fingerprint:string};
export type AdReservation={id:string;title:string;status:'reserved'|'fulfilled'|'cancelled'|'expired';balance_cents:number;credit_cents:number;expires_at:string;campaign_id:string|null};
export type BusinessAds={salon_id:string;is_demo:boolean;eligible:boolean;benefits:{plan:string;discount_percent:number;credit_available_cents:number;period_start:string;period_end:string;early_hours:number};offers:AdQuote[];reservations:AdReservation[]};
export type AdminAdSpace={id:string;title:string;price_cents:number;opens_at:string;starts_at:string;ends_at:string;capacity:number;radius_miles:number;active:boolean};
export type AdminAds={spaces:AdminAdSpace[];reservations:(AdReservation&{business_name:string;price_cents:number;discount_cents:number})[]};
