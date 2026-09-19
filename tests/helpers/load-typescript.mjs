import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);

export function typescriptLoader(root, overrides = {}, globals = {}) {
  const cache = new Map();
  const load = (file) => {
    const resolved = path.resolve(root, file);
    if (cache.has(resolved)) return cache.get(resolved);
    const exports = {}; cache.set(resolved, exports);
    const code = ts.transpileModule(readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(code, { exports, require: name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === 'server-only') return {};
      if (name.startsWith('@/') && /\.[cm]?js$/.test(name)) return require(path.resolve(root, `src/${name.slice(2)}`));
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}${existsSync(path.resolve(root, `src/${name.slice(2)}.tsx`)) ? ".tsx" : ".ts"}`);
      if (name.startsWith('.')) {
        const local = path.resolve(path.dirname(resolved), name);
        if (/\.[cm]?js$/.test(name) && existsSync(local)) return require(local);
        for (const extension of ['.ts', '.tsx']) if (existsSync(local + extension)) return load(local + extension);
      }
      return require(name);
    }, Request, Response, URL, AbortSignal, Buffer, structuredClone, setTimeout, clearTimeout, process, ...globals });
    return exports;
  };
  return load;
}
