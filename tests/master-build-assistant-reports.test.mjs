import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const {assistantReportPeriod}=loadNodeTypescript(process.cwd())('src/lib/assistantReportPeriod.ts');
const period={from:'2026-09-01',to:'2026-09-30',timeZone:'America/New_York'};
test('assistant exports use valid authenticated reporting days, not raw URLs or model prose',()=>{
 for(const scope of ['authenticated_business_only','own_stylist_only'])assert.deepEqual(assistantReportPeriod({scope,period,download_url:'https://foreign.example',salon_id:'ignored'}),period);
 for(const value of [null,'download September',[],{period},{scope:'public',period},{scope:'authenticated_business_only',period:{...period,from:'2026-09-31'}},{scope:'authenticated_business_only',period:{...period,to:'2026-08-31'}},{scope:'authenticated_business_only',period:{...period,timeZone:'invalid'}},{scope:'authenticated_business_only',period:{...period,from:20260901}}])assert.equal(assistantReportPeriod(value),null);
});
