import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function harness(kind, initialAuth=true){
  const slots=[];let cursor=0,initialized=false,changeAuth,sessionWait;
  let session={user:{id:'owner-a'},access_token:'fixture-a'};
  const requests=[],responses=[],saved=[];
  const react={useRef(value){const index=cursor++;return slots[index]??={current:value};},useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},useEffect(effect){if(!initialized)effect();}};
  const Component=typescriptLoader(process.cwd(),{
    react,'@/components/owner/GcAssistant':{Facts:'facts'},
    '@/components/i18n/LocaleProvider':{useI18n:()=>({locale:'fr',translateSource:v=>v,formatDate:String})},
    '@/lib/supabase':{getSessionForScope:async()=>sessionWait?sessionWait.promise:session,getSupabaseForScope:()=>({auth:{onAuthStateChange:callback=>{changeAuth=callback;return {data:{subscription:{unsubscribe(){}}}};}}})},
  },{crypto:{randomUUID},window:{dispatchEvent(){}},Event,fetch:async(url,options)=>{requests.push({url,...options});const response=deferred();responses.push(response);return response.promise;}})('src/components/owner/'+kind+'.tsx').default;
  function render(){cursor=0;const tree=Component(kind==='BookingNotes'?{bookingId:'fixture-booking'}:{styles:[],stylists:[],timeZone:'America/New_York',onSaved:row=>saved.push(row)});initialized=true;return tree;}
  function find(predicate,node=render()){if(!node||typeof node!=='object')return null;if(Array.isArray(node))return node.map(child=>find(predicate,child)).find(Boolean);if(predicate(node))return node;return find(predicate,node.props?.children??null);}
  function text(node=render()){if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(text).join(' ');if(typeof node!=='object')return String(node);return text(node.props?.children??null);}
  render();if(initialAuth)changeAuth('SIGNED_IN',session);
  return {requests,responses,saved,find,text,render,initialSession:()=>changeAuth('INITIAL_SESSION',session),holdSession:()=>sessionWait=deferred(),switchActor(id){session=id?{user:{id},access_token:'fixture-'+id}:null;changeAuth(id?'SIGNED_IN':'SIGNED_OUT',session);}};
}

test('manual appointment controls wait for the initial session before accepting input',async()=>{
  const app=harness('ManualAppointmentEditor',false);
  assert.equal(app.find(n=>n.type==='fieldset')?.props.disabled,true,'The delayed initial session must not erase input accepted by an enabled form');
  app.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();
  assert.equal(app.requests.length,0);
  app.initialSession();
  assert.equal(app.find(n=>n.type==='fieldset').props.disabled,false);
  app.find(n=>n.type==='input'&&n.props.maxLength===120).props.onChange({target:{value:'Sheila'}});
  app.initialSession();
  assert.equal(app.find(n=>n.type==='input'&&n.props.maxLength===120).props.value,'Sheila','Repeated same-actor session events must retain the draft');
  app.switchActor(null);
  assert.equal(app.find(n=>n.type==='fieldset').props.disabled,true);
  assert.equal(app.find(n=>n.type==='input'&&n.props.maxLength===120).props.value,'');
});
test('delayed manual preparation cannot restore a preview after an account switch',async()=>{
  const app=harness('ManualAppointmentEditor');app.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();assert.equal(app.requests.length,1);
  app.switchActor('owner-b');app.responses[0].resolve(Response.json({request:{id:'private-a',digest:'a'.repeat(64),arguments:{guest_name:'PRIVATE A'},execution_payload:{}}}));await tick();
  assert.doesNotMatch(app.text(),/Confirm this change|PRIVATE A/);assert.deepEqual(app.saved,[]);
});
test('manual operation awaiting authentication cannot execute with a replacement session',async()=>{
  const app=harness('ManualAppointmentEditor');const held=app.holdSession();app.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  app.switchActor('owner-b');held.resolve({user:{id:'owner-b'},access_token:'fixture-b'});await tick();assert.equal(app.requests.length,0);
});
test('late private-note reads never cross an owner session boundary',async()=>{
  const app=harness('BookingNotes');assert.equal(app.requests.length,1);app.switchActor('owner-b');assert.equal(app.requests.length,2);
  app.responses[0].resolve(Response.json({notes:[{id:'old',body:'PRIVATE A',created_at:'2030-01-01'}]}));await tick();assert.doesNotMatch(app.text(),/PRIVATE A/);
  app.responses[1].resolve(Response.json({notes:[{id:'new',body:'Owner B note',created_at:'2030-01-01'}]}));await tick();assert.match(app.text(),/Owner B note/);
});

test('private-note preparation locks editing and confirmation shows the persisted note text',async()=>{
  const app=harness('BookingNotes');app.responses[0].resolve(Response.json({notes:[]}));await tick();
  app.find(n=>n.type==='textarea').props.onChange({target:{value:'Original private note'}});
  app.find(n=>n.type==='button').props.onClick();await tick();assert.equal(app.find(n=>n.type==='textarea').props.disabled,true);
  app.responses[1].resolve(Response.json({request:{id:'preview',digest:'a'.repeat(64),arguments:{note:'Original private note'}}}));await tick();
  assert.match(app.text(),/Review this draft Original private note/);
  app.find(n=>n.type==='textarea').props.onChange({target:{value:'Edited private note'}});
  assert.doesNotMatch(app.text(),/Confirm this change/);
});
