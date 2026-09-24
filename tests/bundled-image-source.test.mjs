import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const {bundledImageSource}=typescriptLoader(process.cwd())('src/lib/bundledImageSource.ts');

test('the exact bundled sample assets render from the current deployment',()=>{
 for(const name of ['salon-warm','salon-modern','salon-dark','salon-blush','hero-braids','braids-box','braids-cornrows','braids-knotless']){
  assert.equal(bundledImageSource(`https://girlzculture.com/images/${name}.jpg`),`/images/${name}.jpg`);
 }
});
test('uploaded, signed and third-party URLs are never rewritten',()=>{
 for(const source of ['https://storage.example/salon-warm.jpg','https://girlzculture.com/uploads/salon-warm.jpg','https://girlzculture.com.evil.invalid/images/salon-warm.jpg','https://girlzculture.com/images/salon-warm.jpg?token=sample','https://girlzculture.com/images/../other.jpg','http://girlzculture.com/images/salon-warm.jpg','https://other.example/images/salon-warm.jpg','/images/salon-warm.jpg']){
  assert.equal(bundledImageSource(source),source);
 }
});

test('original Culture House service, professional and matching product imagery ships on every candidate',()=>{
 for(const name of ['cover','amara','nia','zuri','imani','leila','sienna','boho-braids','box-braids','loc-retwist','cornrows','two-strand-twists','feed-in-braids','moisture-shampoo','leave-in-conditioner','scalp-oil','satin-bonnet','logo']){
  const path=`/images/culture-house/${name}.${name==='logo'?'svg':'webp'}`;
  assert.equal(bundledImageSource('https://girlzculture.com'+path),path);
  assert.equal(existsSync('public'+path),true);
  assert.equal(bundledImageSource('https://girlzculture.com'+path+'?signature=unchanged'),'https://girlzculture.com'+path+'?signature=unchanged');
 }
});
