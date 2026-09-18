"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {Boxes,Plus} from "lucide-react";
import {useI18n} from "@/components/i18n/LocaleProvider";
import {createAuthenticatedApiClient} from "@/lib/scopedApiClient";
import {scopedApiErrorMessage} from "@/lib/scopedApiCore";
import {moneyCents} from "@/lib/businessFinanceCore";
import {productStock} from "@/lib/businessProductInventory";

type Item={id:string;name:string;unit:string;inventory_quantity:number;low_stock_threshold:number;track_inventory:boolean;stock_revision:number;kind:'product'|'supply'};
type Movement={id:string;name:string;before_quantity:number|null;after_quantity:number;reason:string;created_at:string;note:string|null};
type Snapshot={products:Omit<Item,'kind'>[];supplies:Omit<Item,'kind'>[];movements:Movement[];history_limit:number};
const control='min-h-11 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm';
const button='min-h-11 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-primary';
const primary=button+' !border-primary !bg-primary !text-white';
export default function BusinessInventory({canLogCost,onProductsChanged}:{canLogCost:boolean;onProductsChanged:(products:Snapshot['products'])=>void}){
 const {translateSource:t,formatNumber,locale}=useI18n();
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [mode,setMode]=useState(''),[selected,setSelected]=useState<Item|null>(null),[filter,setFilter]=useState('all'),[q,setQ]=useState('');
 const generation=useRef(0),pending=useRef(false),request=useRef<{signature:string;id:string}|null>(null),changed=useRef(onProductsChanged);
 useEffect(()=>{changed.current=onProductsChanged;},[onProductsChanged]);
 const load=useCallback(async()=>{
  const current=++generation.current;setLoading(true);
  try {const api=await createAuthenticatedApiClient('salon');const result=await api.request<Snapshot>('/api/salon/inventory');if(current!==generation.current)return;setData(result);changed.current(result.products);}
  catch(failure){if(current===generation.current){setData(null);setError(scopedApiErrorMessage(failure,t('Stock could not be loaded.')));}}
  finally{if(current===generation.current)setLoading(false);}
 },[t]);
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active)void load();});return()=>{active=false;
  // This numeric generation invalidates requests; it is not a DOM ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  generation.current++;
 };},[load]);
 const items:Item[]=[...(data?.products||[]).map(row=>({...row,kind:'product' as const})),...(data?.supplies||[]).map(row=>({...row,kind:'supply' as const}))];
 const choose=(action:string,item:Item|null=null)=>{setMode(action);setSelected(item);setError('');setNotice('');request.current=null;};
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current)return;
  const form=new FormData(event.currentTarget),value=(key:string)=>String(form.get(key)||'').trim();
  let payload:Record<string,unknown>;
  try {
   payload=mode==='create_supply'?{name:value('name'),unit:value('unit'),quantity:Number(value('quantity')),low_stock_threshold:Number(value('low_stock_threshold'))}:{[selected?.kind==='product'?'product_id':'supply_id']:selected?.id,expected_revision:selected?.stock_revision};
   if(['restock','correction','consumption'].includes(mode))payload.quantity=Number(value('quantity'));
   if(mode==='settings'){payload.low_stock_threshold=Number(value('low_stock_threshold'));if(selected?.kind==='product')payload.track_inventory=form.get('track_inventory')==='on';}
   if(value('note'))payload.note=value('note');
   if(value('cost'))payload.cost_cents=moneyCents(value('cost'));
  }catch{setError(t('Check the amount and required fields.'));return;}
  const signature=JSON.stringify([mode,payload]);if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
  const current=generation.current;pending.current=true;setBusy(true);setError('');
  try{const api=await createAuthenticatedApiClient('salon');const result=await api.request('/api/salon/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:mode,request_id:request.current.id,payload})});if(current!==generation.current)return;if(result.verified!==true)throw Error('Stock not verified');setMode('');setSelected(null);request.current=null;setNotice(t('Stock saved and verified.'));await load();}
  catch(failure){if(current===generation.current)setError(scopedApiErrorMessage(failure,t('Could not verify the stock change. Your entry is retained.')));}
  finally{pending.current=false;setBusy(false);}
 }
 const labels:Record<string,string>={create_supply:'Add supply',restock:'Restock',correction:'Correct stock',consumption:'Record usage',settings:'Stock settings',archive_supply:'Archive supply'};
 const stateLabels={untracked:'Stock not tracked',unknown:'Stock unavailable',out:'Out of stock',low:'Low stock',available:'In stock'};
 return <section aria-label={t('Stock and supplies')} className="space-y-4">
  <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="font-serif text-3xl font-bold">{t('Stock and supplies')}</h1><p className="mt-1 max-w-xl text-sm text-text-secondary">{t('Track retail stock and private business supplies. Sales and reservations update stock once.')}</p></div><button className={primary} onClick={()=>choose('create_supply')}><Plus size={16} className="mr-1 inline"/>{t('Add supply')}</button></header>
  {error?<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">{error}<p className="mt-2">{t('If stock changed elsewhere, close this entry and reload before reviewing a new adjustment.')}</p></div>:null}
  {notice?<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm">{notice}</p>:null}
  {loading?<p role="status">{t('Loading stock…')}</p>:null}
  {mode?<form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-white p-4" aria-label={t(labels[mode])}>
   <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl font-bold">{t(labels[mode])} {selected?<span data-no-translate>· {selected.name}</span>:null}</h2><button type="button" disabled={busy} className={button} onClick={()=>choose('')}>{t('Cancel')}</button></div>
   <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
    {mode==='create_supply'?<><label className="space-y-1 text-sm">{t('Supply name')}<input name="name" required maxLength={120} className={control}/></label><label className="space-y-1 text-sm">{t('Unit label')}<input name="unit" required maxLength={30} placeholder={t('For example, bottles or boxes')} className={control}/></label></>:null}
    {['create_supply','restock','correction','consumption'].includes(mode)?<label className="space-y-1 text-sm">{t(mode==='correction'?'Actual quantity available':'Quantity')}<input name="quantity" type="number" step="1" min={['restock','consumption'].includes(mode)?1:0} max={1000000} required defaultValue={mode==='correction'?selected?.inventory_quantity:undefined} className={control}/></label>:null}
    {['create_supply','settings'].includes(mode)?<label className="space-y-1 text-sm">{t('Low-stock alert at')}<input name="low_stock_threshold" type="number" step="1" min="0" max="1000000" required defaultValue={selected?.low_stock_threshold??5} className={control}/></label>:null}
    {mode==='settings'&&selected?.kind==='product'?<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="track_inventory" defaultChecked={selected.track_inventory}/>{t('Track inventory')}</label>:null}
    {mode==='restock'&&canLogCost?<label className="space-y-1 text-sm">{t('Purchase cost (optional)')}<input name="cost" inputMode="decimal" className={control}/></label>:null}
    {['restock','correction','consumption'].includes(mode)?<label className="space-y-1 text-sm sm:col-span-2">{t('Reason / note')}<input name="note" required={mode==='correction'} maxLength={500} className={control}/></label>:null}
   </fieldset>
   {mode==='restock'&&canLogCost?<p className="text-xs text-text-secondary">{t(selected?.kind==='product'?'Retail purchases are inventory assets. Record sold-product cost with the sale; it is not deducted twice.':'Supply purchases are recorded as operating expenses. Do not log this purchase again in Finances.')}</p>:null}
   {mode==='correction'?<p className="text-xs text-text-secondary">{t('Enter stock available for new sales, excluding units already reserved for orders.')}</p>:null}
   {mode==='archive_supply'?<p className="text-sm">{t('This hides the supply and preserves its stock history.')}</p>:null}
   <button type="submit" disabled={busy} className={primary}>{t(busy?'Saving…':'Save stock change')}</button>
  </form>:null}
  {!mode?<button className={button} disabled={loading||busy} onClick={()=>{setError('');void load();}}>{t('Reload')}</button>:null}
  <div className="flex flex-wrap gap-2"><input aria-label={t('Search stock')} placeholder={t('Search stock')} value={q} onChange={event=>setQ(event.target.value)} className={control+' sm:!w-64'}/><select aria-label={t('Inventory filter')} value={filter} onChange={event=>setFilter(event.target.value)} className={control+' sm:!w-48'}><option value="all">{t('All stock')}</option><option value="product">{t('Retail products')}</option><option value="supply">{t('Business supplies')}</option><option value="low">{t('Low or zero stock')}</option></select></div>
  <div className="grid gap-3 md:grid-cols-2">{items.filter(item=>item.name.toLocaleLowerCase().includes(q.toLocaleLowerCase())&&(filter==='all'||filter===item.kind||filter==='low'&&['low','out'].includes(productStock(item).state))).map(item=>{const state=productStock(item);return <article key={item.id} aria-label={item.name} className="space-y-3 rounded-xl border border-border bg-white p-4"><div className="flex items-start gap-3"><Boxes size={24} className="shrink-0 text-primary"/><div className="min-w-0"><h2 data-no-translate className="break-words font-serif text-xl font-bold">{item.name}</h2><p className="text-xs text-text-secondary">{t(item.kind==='product'?'Retail products':'Business supplies')}</p></div><strong className="ml-auto">{state.quantity==null?'—':formatNumber(state.quantity)}<span data-no-translate className="block text-xs font-normal">{item.kind==='product'?t('units'):item.unit}</span></strong></div><p className={'text-sm '+(['low','out'].includes(state.state)?'text-amber-800':'text-text-secondary')}>{t(stateLabels[state.state])}{item.track_inventory?` · ${t('Low-stock alert at')} ${formatNumber(item.low_stock_threshold)}`:''}</p><div className="flex flex-wrap gap-2">{item.track_inventory?<><button className={button} disabled={busy} onClick={()=>choose('restock',item)}>{t('Restock')}</button><button className={button} disabled={busy} onClick={()=>choose('correction',item)}>{t('Correct stock')}</button><button className={button} disabled={busy} onClick={()=>choose('consumption',item)}>{t('Record usage')}</button></>:null}<button className={button} disabled={busy} onClick={()=>choose('settings',item)}>{t('Stock settings')}</button>{item.kind==='supply'?<button className={button} disabled={busy} onClick={()=>choose('archive_supply',item)}>{t('Archive supply')}</button>:null}</div></article>;})}</div>
  {data&&!items.length?<p className="rounded-xl border border-border p-4 text-sm">{t('No inventory items yet. Add a retail product or a business supply.')}</p>:null}
  {data?<details className="rounded-xl border border-border bg-white p-4"><summary className="min-h-11 cursor-pointer content-center font-serif text-xl font-bold">{t('Stock history')}</summary><p className="my-2 text-xs text-text-secondary">{t('Latest 250 changes. System changes include existing checkout reservations, releases and imports. Earlier history is not invented.')}</p><ul className="divide-y divide-border">{data.movements.map(row=><li key={row.id} className="py-3 text-sm"><span data-no-translate className="font-semibold">{row.name}</span> · {t(({opening:'Opening stock',system_change:'System stock change',restock:'Restock',correction:'Correct stock',consumption:'Record usage',offline_sale:'Recorded product sale',settings:'Stock settings'} as Record<string,string>)[row.reason]||'System stock change')}<p>{row.before_quantity==null?'—':formatNumber(row.before_quantity)} → {formatNumber(row.after_quantity)} · {new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(row.created_at))}</p>{row.note?<p data-no-translate className="break-words text-text-secondary">{row.note}</p>:null}</li>)}</ul></details>:null}
 </section>;
}
