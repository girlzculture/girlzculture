import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);

// Byte-generating Node libraries such as ExcelJS use instanceof Array/Buffer.
// Run those integration tests in Node's realm, not a VM with incompatible
// intrinsic prototypes. Load only trusted repository modules, never user data.
export function loadNodeTypescript(root,overrides={}){
 const cache=new Map();
 const load=file=>{
  const resolved=path.resolve(root,file);if(cache.has(resolved))return cache.get(resolved);
  const exports={};cache.set(resolved,exports);
  const code=ts.transpileModule(readFileSync(resolved,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const resolve=name=>{
   if(Object.hasOwn(overrides,name))return overrides[name];if(name==='server-only')return {};
   if(name.startsWith('@/'))return load(`src/${name.slice(2)}${existsSync(path.resolve(root,`src/${name.slice(2)}.tsx`))?'.tsx':'.ts'}`);
   return require(name);
  };
  new Function('exports','require',code)(exports,resolve);return exports;
 };
 return load;
}
