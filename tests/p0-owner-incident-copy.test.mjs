import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd());
const {actionToastMessage,actionToastReference,actionToastIsError}=load('src/lib/actionToastCore.ts');
const {DASHBOARD_SOURCE_MESSAGES}=load('src/i18n/dashboard-source-catalog.ts');
test('save errors keep a translatable sentence and the exact server incident reference independently',()=>{
 const copy="We couldn't save this change. Please try again.";
 for(const reference of ['P0-SAVE-FAILURE','10000000-0000-4000-8000-000000000001']){
  const message=`${copy} Reference ${reference}.`;
  assert.equal(actionToastReference(message),reference);assert.equal(actionToastMessage(message),copy);assert.equal(actionToastIsError(message),true);
  for(const locale of ['fr','es','zh-CN'])assert.ok(DASHBOARD_SOURCE_MESSAGES[locale][actionToastMessage(message)]);
 }
 assert.equal(actionToastMessage('Saved and verified.'),'Saved and verified.');
});
