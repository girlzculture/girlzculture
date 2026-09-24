/** Interface labels only; never rewrite a business's authored names or descriptions. */
export function businessLabels(category: unknown, independent=false) {
 const value=String(category||'').toLowerCase();
 const team=/aesthetic/.test(value)?'Practitioners':/massage|wellness/.test(value)?'Therapists':/tattoo/.test(value)?'Artists':/barber/.test(value)?'Barbers':/nail|lash|brow/.test(value)?'Technicians':'Stylists';
 return {team:independent?null:team,services:/aesthetic/.test(value)?'Treatments & Pricing':'Services & Pricing'};
}
