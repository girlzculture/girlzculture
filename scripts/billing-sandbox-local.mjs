import { spawnSync } from 'node:child_process';
import { requireSafe } from './billing-sandbox-guards.mjs';

export const sqlLiteral=value=>value===null?'null':typeof value==='boolean'?String(value):`'${String(value).replaceAll("'","''")}'`;

/** Local CI uses fixed defaults. Tests can select only another explicitly named
 * disposable loopback fixture; no database URL, hostname or provider credential
 * is accepted. This adapter never establishes a Supabase connection. */
export function localDatabase({database='girlzculture_clean',port=5432,psql='psql'}={}) {
  requireSafe(database==='girlzculture_clean'||/^girlzculture_billing_fixture_[a-z0-9]+$/.test(database),'LOCAL_FIXTURE_DATABASE_REQUIRED');
  requireSafe(Number.isInteger(port)&&port>=1024&&port<=65535,'LOCAL_FIXTURE_PORT_REQUIRED');
  const env={...process.env};
  // Empty PGSERVICE still requests a service definition. Remove all inherited
  // libpq settings, including PGHOSTADDR/PGOPTIONS, before setting loopback.
  for(const name of Object.keys(env))if(/^PG|STRIPE|SUPABASE|TOKEN|SECRET|PASSWORD|DATABASE_URL/i.test(name))delete env[name];
  Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'postgres',PGDATABASE:database,PGPASSWORD:'postgres',PGSSLMODE:'disable'});
  const run=sql=>{
    const result=spawnSync(psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',database],{input:sql,encoding:'utf8',env,maxBuffer:4*1024*1024,timeout:15_000});
    requireSafe(!result.error&&result.status===0,'LOCAL_DATABASE_OPERATION_FAILED');
    return result.stdout.trim();
  };
  const actual=JSON.parse(run("select json_build_object('database',current_database(),'address',host(inet_server_addr()),'migration',to_regprocedure('public.reserve_subscription_payment_method_attempt(uuid,uuid,text,text,boolean,text)') is not null);"));
  requireSafe(actual.database===database&&['127.0.0.1','::1'].includes(actual.address)&&actual.migration===true,'LOCAL_DATABASE_IDENTITY_FAILED');
  return run;
}

export function localAdmin(run) {
  const tables=new Set(['subscriptions','subscription_payment_method_attempts']);
  const filterFields=new Set(['salon_id','id','stripe_checkout_session_id','status']);
  const rpcs=new Set(['reserve_subscription_payment_method_attempt','bind_subscription_payment_method_attempt','claim_subscription_payment_method_attempt','mark_subscription_payment_method_apply','finish_subscription_payment_method_attempt']);
  return {
    from(table) {
      requireSafe(tables.has(table),'LOCAL_TABLE_NOT_ALLOWLISTED');const clauses=[];let selected;
      const q={select(fields){
          requireSafe(table==='subscriptions'?fields==='stripe_customer_id,stripe_subscription_id':['*','id','stripe_checkout_session_id'].includes(fields),'LOCAL_PROJECTION_NOT_ALLOWLISTED');selected=fields;return q;
        },eq(key,value){requireSafe(filterFields.has(key),'LOCAL_FILTER_NOT_ALLOWLISTED');clauses.push(`${key}=${sqlLiteral(value)}`);return q;},
        in(key,values){requireSafe(filterFields.has(key)&&Array.isArray(values)&&values.length<=10,'LOCAL_FILTER_NOT_ALLOWLISTED');clauses.push(`${key} in (${values.map(sqlLiteral).join(',')})`);return q;},
        async maybeSingle(){
          requireSafe(Boolean(selected),'LOCAL_PROJECTION_REQUIRED');
          const rows=JSON.parse(run(`begin;set local role service_role;select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) from (select ${selected} from public.${table} where ${clauses.join(' and ')||'false'} limit 2) row;commit;`));
          requireSafe(rows.length<=1,'LOCAL_FIXTURE_NOT_UNIQUE');return {data:rows[0]||null,error:null};
        }};return q;
    },
    async rpc(name,args){
      requireSafe(rpcs.has(name),'LOCAL_RPC_NOT_ALLOWLISTED');
      const parameters=Object.entries(args).map(([key,value])=>{requireSafe(/^p_[a-z_]+$/.test(key),'LOCAL_PARAMETER_NOT_ALLOWLISTED');return `${key}=>${sqlLiteral(value)}`;}).join(',');
      const data=JSON.parse(run(`begin;set local role service_role;select to_jsonb(public.${name}(${parameters}));commit;`));
      return {data,error:null};
    },
  };
}
