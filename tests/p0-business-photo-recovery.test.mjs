import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
test('photo conflict recovery has complete explicit four-language copy',()=>{
 const {BUSINESS_PHOTO_RECOVERY_COPY:copy}=typescriptLoader(process.cwd())('src/i18n/business-photo-recovery-copy.ts');
 assert.deepEqual(Object.keys(copy),['en','fr','es','zh-CN']);
 for(const rows of Object.values(copy)){assert.deepEqual(Object.keys(rows),Object.keys(copy.en));for(const value of Object.values(rows))assert.ok(typeof value==='string'&&value.trim());}
});
