import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createRequire} from 'node:module';
import {localVerificationDatabase} from '../scripts/lib/local-verification-database.mjs';

test('the exact required CI database is a permitted disposable clone source', () => {
  const yaml=createRequire(import.meta.url)('js-yaml');
  const workflow=yaml.load(readFileSync(new URL('../.github/workflows/database-migrations.yml',import.meta.url),'utf8'));
  const source=localVerificationDatabase(workflow.jobs.verify.env.CLEAN_DATABASE_URL);
  assert.equal(source.hostname,'127.0.0.1');
  assert.equal(source.pathname,'/girlzculture_clean');
});

for (const value of [
  'postgresql://postgres@127.0.0.1:5432/girlzculture_clean',
  'postgresql://postgres@localhost:5432/girlzculture_release',
  'postgres://postgres@[::1]:5432/girlzculture_master_final_release',
  'postgresql://postgres@127.0.0.1:5432/girlzculture_master_216_clean',
]) test('permits an explicitly disposable local source: '+new URL(value).pathname, () => {
  assert.equal(localVerificationDatabase(value).toString(),value);
});

for (const [reason,value] of [
  ['missing input',''],
  ['remote host','postgresql://fixture@db.example.test/girlzculture_clean'],
  ['lookalike localhost','postgresql://fixture@localhost.example.test/girlzculture_clean'],
  ['normal database','postgresql://fixture@127.0.0.1/postgres'],
  ['production name','postgresql://fixture@127.0.0.1/girlzculture_production'],
  ['incomplete disposable name','postgresql://fixture@127.0.0.1/girlzculture_clean_backup'],
  ['path injection','postgresql://fixture@127.0.0.1/girlzculture_clean%3Bdrop'],
  ['wrong protocol','https://127.0.0.1/girlzculture_clean'],
  ['host override','postgresql://fixture@127.0.0.1/girlzculture_clean?host=db.example.test'],
  ['service override','postgresql://fixture@127.0.0.1/girlzculture_clean?service=production'],
  ['fragment','postgresql://fixture@127.0.0.1/girlzculture_clean#production'],
]) test('rejects '+reason+' before any database process starts', () => {
  assert.throws(()=>localVerificationDatabase(value),{message:'LOCAL_VERIFICATION_DATABASE_REQUIRED'});
});
