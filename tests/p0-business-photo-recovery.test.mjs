import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
test('photo conflict recovery has complete explicit four-language copy',()=>{
 const {BUSINESS_PHOTO_RECOVERY_COPY:copy}=typescriptLoader(process.cwd())('src/i18n/business-photo-recovery-copy.ts');
 assert.deepEqual(Object.keys(copy),['en','fr','es','zh-CN']);
 for(const rows of Object.values(copy)){assert.deepEqual(Object.keys(rows),Object.keys(copy.en));for(const value of Object.values(rows))assert.ok(typeof value==='string'&&value.trim());}
});

test('photo tools disclosure has explicit readable four-language labels',()=>{
 const {BUSINESS_PHOTO_LAYOUT_COPY:copy,businessPhotoLayoutCopy}=typescriptLoader(process.cwd())('src/i18n/business-photo-layout-copy.ts');
 assert.deepEqual(Object.keys(copy),['en','fr','es','zh-CN']);
 for(const [locale,rows] of Object.entries(copy)){assert.deepEqual(Object.keys(rows),['tools']);assert.ok(rows.tools.trim());assert.deepEqual(businessPhotoLayoutCopy(locale),rows);}
 assert.notEqual(copy.fr.tools,copy.en.tools);assert.notEqual(copy.es.tools,copy.en.tools);assert.notEqual(copy['zh-CN'].tools,copy.en.tools);
});
