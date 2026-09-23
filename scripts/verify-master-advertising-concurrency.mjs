import {readFileSync}from'node:fs';import{spawn,spawnSync}from'node:child_process';import assert from'node:assert/strict';import{randomBytes,randomUUID}from'node:crypto';
export async function verifyAdvertisingConcurrency(databaseUrl,psql=process.env.PSQL_BIN||'psql'){
 const source=new URL(databaseUrl);assert.ok(['127.0.0.1','localhost'].includes(source.hostname));assert.match(source.pathname,/^\/girlzculture_(clean|master_clean_verified|[a-z_]+_release)$/);
 const name='girlzculture_ad_race_'+randomBytes(6).toString('hex'),control=new URL(source);control.pathname='/postgres';const target=new URL(source);target.pathname='/'+name;
 const execute=(url,sql)=>{const r=spawnSync(psql,[url.toString(),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r;};
 execute(control,'create database '+name+' template '+source.pathname.slice(1));
 try{
  const prefix=readFileSync('scripts/sql/verify-master-advertising.sql','utf8').split(' first:=public.reserve_business_ad_space')[0];
  const seeded=execute(target,prefix+`raise notice 'AD_RACE:%',jsonb_build_object('a',a,'b',b,'oa',oa,'ob',ob,'space',space,'fa',fingerprint,'fb',public.read_business_ad_spaces(b,ob)->'offers'->0->>'fingerprint');end $$;commit;`);
  const f=JSON.parse(seeded.stderr.match(/AD_RACE:(\{.*\})/)[1]);for(const k of ['a','b','oa','ob','space'])assert.match(f[k],/^[a-f0-9-]{36}$/);for(const k of ['fa','fb'])assert.match(f[k],/^[a-f0-9]{32}$/);
  const attempt=(business,actor,space,fingerprint)=>new Promise((resolve,reject)=>{const child=spawn(psql,[target.toString(),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(`begin;set local lock_timeout='10s';set local role service_role;select public.reserve_business_ad_space('${business}','${actor}','${space}','${randomUUID()}','${fingerprint}');commit;`);});
  const capacity=await Promise.all([attempt(f.a,f.oa,f.space,f.fa),attempt(f.b,f.ob,f.space,f.fb)]);
  assert.equal(capacity.filter(r=>r.code===0).length,1,JSON.stringify(capacity));assert.match(capacity.find(r=>r.code!==0).stderr,/AD_NOT_AVAILABLE/);assert.equal(execute(target,'select count(*) from gc_private.ad_reservations;').stdout.trim(),'1');
  const second=randomUUID();execute(target,`delete from gc_private.ad_reservations;insert into gc_private.ad_spaces(id,title,price_cents,opens_at,starts_at,ends_at,capacity,radius_miles,created_by)select '${second}',title,price_cents,opens_at,starts_at+interval '21 days',ends_at+interval '21 days',capacity,radius_miles,created_by from gc_private.ad_spaces where id='${f.space}';`);
  const q=JSON.parse(execute(target,`select jsonb_build_object('first',gc_private.ad_quote('${f.a}','${f.space}')->>'fingerprint','second',gc_private.ad_quote('${f.a}','${second}')->>'fingerprint');`).stdout.trim());
  const credit=await Promise.all([attempt(f.a,f.oa,f.space,q.first),attempt(f.a,f.oa,second,q.second)]);
  assert.equal(credit.filter(r=>r.code===0).length,1,JSON.stringify(credit));assert.match(credit.find(r=>r.code!==0).stderr,/AD_QUOTE_CHANGED/);assert.equal(execute(target,`select count(*),sum(credit_cents)from gc_private.ad_reservations where salon_id='${f.a}';`).stdout.trim(),'1|1000');
  console.log('Advertising concurrency: 6 assertions passed; simultaneous businesses cannot overbook one space, simultaneous own reservations cannot spend the same credit twice.');
 }finally{execute(control,'drop database '+name+' with(force)');}
}
