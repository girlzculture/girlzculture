import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';

test('review input snapshots the edit before React defers an updater and restores the controlled DOM value',()=>{
 const state=[],pending=[];let cursor=0;
 const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>pending.push(()=>{state[i]=typeof value==='function'?value(state[i]):value;})];},useRef(initial){const i=cursor++;return state[i]??={current:initial};}};
 const Component=typescriptLoader(process.cwd(),{
  react,'next/link':{default:'a'},'next/navigation':{useSearchParams:()=>new URLSearchParams()},'lucide-react':{},
  '@/components/i18n/LocaleProvider':{useI18n:()=>({translateSource:s=>s,formatDate:()=>'',formatNumber:String})},
  '@/lib/supabase':{},
 })('src/components/owner/ReviewsWorkspace.tsx').default;
 const props={reviews:[{id:'review-a',display_name:'Fixture',moderation_status:'Published',created_at:'2030-01-01',rating_overall:5}],bookings:[],styles:[],timeZone:'UTC',recordId:'review-a',setReviews(){},saveRecord(){}};
 function render(){cursor=0;return Component(props);}
 function nodes(tree,type){if(!tree||typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(n=>nodes(n,type));return[...(tree.type===type?[tree]:[]),...nodes(tree.props?.children,type)];}
 const input=nodes(render(),'textarea')[0],target={value:'Thank you for visiting. We will follow up respectfully.'};
 const typed=target.value;input.props.onChange({target,currentTarget:target});
 target.value=''; // Controlled restoration may run before a deferred state updater.
 pending.splice(0).forEach(run=>run());
 const tree=render();assert.equal(nodes(tree,'textarea')[0].props.value,typed);
 assert.equal(nodes(tree,'button').find(n=>n.props.children==='Save reply').props.disabled,false);
});
