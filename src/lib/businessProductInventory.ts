type Row=Record<string,unknown>;
export function productStock(row:Row):{state:'untracked'|'unknown'|'out'|'low'|'available';quantity:number|null}{
 if(row.track_inventory!==true)return{state:'untracked',quantity:null};
 const quantity=row.inventory_quantity;
 if(typeof quantity!=='number'||!Number.isSafeInteger(quantity)||quantity<0)return{state:'unknown',quantity:null};
 if(quantity===0)return{state:'out',quantity};
 return{state:typeof row.low_stock_threshold==='number'&&quantity<=row.low_stock_threshold?'low':'available',quantity};
}
/** An attached, currently active offer is not a customer-specific price quote. */
export function productHasOffer(product:Row,promotions:Row[],now:number){
 if(typeof product.salon_id!=='string'||!product.salon_id||typeof product.id!=='string')return false;
 return promotions.some(offer=>offer.salon_id===product.salon_id&&offer.is_active===true&&offer.status==='Active'&&!offer.archived_at&&!offer.paused_at&&
  (!offer.starts_at||Number.isFinite(Date.parse(String(offer.starts_at)))&&Date.parse(String(offer.starts_at))<=now)&&
  (!offer.ends_at||Number.isFinite(Date.parse(String(offer.ends_at)))&&Date.parse(String(offer.ends_at))>now)&&
  (offer.target_scope==='salon'||offer.target_scope==='products'&&Array.isArray(offer.target_ids)&&offer.target_ids.includes(product.id)));
}
