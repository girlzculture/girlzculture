import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd());
const {calculateSalonPromotion,bestPromotionForContext,promotionLabel}=load('src/lib/salonPromotions.ts');
const context={salonId:'business-A',styleId:'style-A',basePrice:100,selectedAddons:[],subtotal:100,protectedDeposit:10,now:new Date('2026-09-18T12:00:00Z')};
const offer={id:'offer-A',salon_id:'business-A',status:'Active',is_active:true,target_scope:'salon',promotion_type:'percentage',discount_value:20};

test('approved service-price percentage preserves the protected deposit and caps savings at unpaid balance',()=>{
 let price=calculateSalonPromotion(offer,context);assert.equal(price.discount,20);assert.equal(price.total,80);assert.equal(price.total-context.protectedDeposit,70);
 price=calculateSalonPromotion({...offer,discount_value:100},context);assert.equal(price.discount,90);assert.equal(price.total,10);
 price=calculateSalonPromotion({...offer,promotion_type:'fixed',discount_value:1000},context);assert.equal(price.discount,90);assert.equal(price.total,10);
 price=calculateSalonPromotion({...offer,promotion_type:'free_service'},context);assert.equal(price.discount,90);
 price=calculateSalonPromotion(offer,{...context,protectedDeposit:100});assert.equal(price.discount,0);assert.equal(price.total,100);
});

test('every target is bound to the business; business-wide service offers never silently discount products',()=>{
 for(const scope of ['salon','services','service_groups','master_styles','addons','products']){
  const input={...context,productId:'product-A',serviceGroupId:'group-A',masterStyleId:'master-A',selectedAddons:[{value:'addon-A',price:20}]};
  const foreign={...offer,salon_id:'business-B',target_scope:scope,target_ids:['style-A','group-A','master-A','addon-A','product-A']};
  assert.equal(calculateSalonPromotion(foreign,input).eligible,false,scope);
 }
 assert.equal(calculateSalonPromotion(offer,{...context,styleId:null,productId:'product-A'}).eligible,false);
 assert.equal(calculateSalonPromotion({...offer,target_scope:'products',target_ids:['product-A']},{...context,styleId:null,productId:'product-A',protectedDeposit:0}).discount,20);
});

test('add-on-only discounts use only matching selected add-ons and round once to cents',()=>{
 const input={...context,subtotal:140,protectedDeposit:14,selectedAddons:[{value:'trim',price:15},{value:'treatment',price:25}]};
 assert.equal(calculateSalonPromotion({...offer,target_scope:'addons',target_ids:['trim']},input).discount,3);
 assert.equal(calculateSalonPromotion({...offer,target_scope:'addons',target_ids:['trim'],promotion_type:'fixed',discount_value:30},input).discount,15);
 assert.equal(calculateSalonPromotion({...offer,discount_value:33.33},{...context,subtotal:99.99}).discount,33.33);
});

test('expired and malformed offers fail closed; overlapping offers select a single best saving',()=>{
 assert.equal(calculateSalonPromotion({...offer,ends_at:'2026-09-17'},context).eligible,false);
 assert.equal(calculateSalonPromotion({...offer,discount_value:'not-a-price'},context).eligible,false);
 assert.equal(calculateSalonPromotion(offer,{...context,protectedDeposit:NaN}).eligible,false);
 const best=bestPromotionForContext([offer,{...offer,id:'second',discount_value:50}],context);
 assert.equal(best.price.discount,50);assert.equal(best.promotion.id,'second');
});

test('public offer labels describe the actual saving and never promise to waive a protected deposit',()=>{
 const free={...offer,promotion_type:'free_service',discount_label:'Everything free'};
 assert.equal(promotionLabel(free),'Service offer · deposit protected');
 assert.equal(promotionLabel(free,calculateSalonPromotion(free,context).discount),'$90.00 saving');
 assert.equal(promotionLabel(offer,20),'$20.00 saving');
 assert.match(promotionLabel(offer),/^Up to 20% off/);
});
