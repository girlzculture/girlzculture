import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const {productStock,productHasOffer}=typescriptLoader(process.cwd())('src/lib/businessProductInventory.ts');
test('stock states distinguish real zero, low stock, untracked and unavailable data',()=>{
 const row={track_inventory:true,low_stock_threshold:3};
 for(const [quantity,state] of [[0,'out'],[2,'low'],[3,'low'],[4,'available'],[undefined,'unknown'],[null,'unknown'],[-1,'unknown'],[1.5,'unknown']])assert.equal(productStock({...row,inventory_quantity:quantity}).state,state);
 assert.equal(productStock({...row,track_inventory:false,inventory_quantity:0}).state,'untracked');
 assert.equal(productStock({...row,inventory_quantity:undefined}).quantity,null);
});
test('offer badges use only current active own-business offers targeting this product',()=>{
 const now=Date.parse('2026-09-18T12:00:00Z'),product={id:'oil',salon_id:'A'},offer={id:'offer',salon_id:'A',is_active:true,status:'Active',target_scope:'products',target_ids:['oil']};
 assert.equal(productHasOffer(product,[offer],now),true);
 assert.equal(productHasOffer(product,[{...offer,target_scope:'salon',target_ids:[]}],now),true);
 for(const patch of [{salon_id:'B'},{is_active:false},{status:'Draft'},{target_scope:'services'},{target_ids:['comb']},{paused_at:'2026-09-01'},{starts_at:'2026-10-01'},{ends_at:'2026-09-01'},{starts_at:'broken'},{archived_at:'2026-09-01'}])assert.equal(productHasOffer(product,[{...offer,...patch}],now),false,JSON.stringify(patch));
 assert.equal(productHasOffer({},[{...offer,salon_id:undefined}],now),false);
});
