import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';

export async function verifyWaitlistConcurrency(databaseUrl,psql=process.env.PSQL_BIN||'psql'){
 const url=new URL(databaseUrl);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Concurrency fixtures require a local disposable database');
 assert.match(url.pathname,/^\/girlzculture_(clean|[a-z_]+_release)$/);
 const suffix=randomBytes(6).toString('hex'),clone='girlzculture_waitlist_'+suffix;
 const controlUrl=new URL(databaseUrl);controlUrl.pathname='/postgres';
 function control(sql){const r=spawnSync(psql,[controlUrl.toString(),'-X','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 const template=url.pathname.slice(1);control('create database '+clone+' template '+template);
 const cloneUrl=new URL(databaseUrl);cloneUrl.pathname='/'+clone;
 const args=[cloneUrl.toString(),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1'];
 function sync(sql){const result=spawnSync(psql,args,{input:sql,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result;}
 try {
 const prefix=readFileSync('scripts/sql/verify-appointment-waitlist.sql','utf8').split(" payload:=jsonb_build_object('waitlist_offer_id',offer_a);")[0];
 const seeded=sync(prefix.replaceAll('@example.test','-'+suffix+'@example.test').replaceAll('wait-business-','wait-business-'+suffix+'-')+`raise notice 'RACE_FIXTURE:%',jsonb_build_object('a',a,'b',b,'owner_a',owner_a,'owner_b',owner_b,'customer_a',customer_a,'customer_b',customer_b,'sa',sa,'pa',pa,'offer_a',offer_a,'offer_b',offer_b,'at_time',at_time);end $$;commit;`);
 const fixture=JSON.parse(seeded.stderr.match(/RACE_FIXTURE:(\{.*\})/)[1]);
 const id=key=>{assert.match(fixture[key],/^[a-f0-9-]{36}$/);return `'${fixture[key]}'`;};
 assert.ok(Number.isFinite(Date.parse(fixture.at_time)));
 function attempt(who){return new Promise((resolve,reject)=>{
  const child=spawn(psql,args,{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
  child.stdin.end(`begin;set local lock_timeout='10s';select public.reserve_booking_checkout(${id('a')},${id('sa')},${id('pa')},${id('customer_'+who)},null,'${fixture.at_time}',1,15,jsonb_build_object('waitlist_offer_id',${id('offer_'+who)}),100,10);commit;`);
 });}
  // Independent sessions start together; no sleeps, retries or synthetic claim mock.
  const results=await Promise.all([attempt('a'),attempt('b')]);
  assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
  assert.match(results.find(r=>r.code!==0).stderr,/BOOKING_RESOURCE_CONFLICT|WAITLIST_OFFER_UNAVAILABLE/);
  const counts=sync(`select (select count(*) from public.booking_checkout_intents where salon_id=${id('a')}),(select count(*) from public.appointment_waitlist_offers where id in(${id('offer_a')},${id('offer_b')}) and status='claimed'),(select count(*) from public.bookings where salon_id=${id('a')} and status='Confirmed');`).stdout.trim();
  assert.equal(counts,'1|1|0');
  console.log('Waitlist concurrency: two real database sessions, one hold/claim, no silent booking or charge.');
 }finally{control('drop database '+clone);}
}
