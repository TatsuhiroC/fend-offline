import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

test('worker and WASM load from the same versioned graph on Pages and native APK origins', async () => {
 const version=(await readdir('www/assets'))[0];
 const dir=join('www/assets',version), names=await readdir(dir);
 const app=await readFile(join(dir,names.find(name=>/^App-.*\.js$/.test(name))),'utf8');
 const worker=await readFile(join(dir,names.find(name=>/^worker-.*\.js$/.test(name))),'utf8');
 const workerRef=app.match(/new Worker\(new URL\("(\.\/worker-[^"]+\.js)", import.meta.url\)\.href/)[1];
 const wasmRef=worker.match(/var fend_wasm_bg_default = new URL\("(\.\/fend_wasm_bg-[^"]+\.wasm)", import.meta.url\)\.href/)[1];
 for(const root of ['https://example.test/fend-offline/','https://localhost/']) {
  const module=new URL(`assets/${version}/App.js`,root);
  const workerURL=new URL(workerRef,module);
  const wasmURL=new URL(wasmRef,workerURL);
  assert.equal(workerURL.href,root+`assets/${version}/`+workerRef.slice(2));
  assert.equal(wasmURL.href,root+`assets/${version}/`+wasmRef.slice(2));
  assert(names.includes(workerRef.slice(2)));assert(names.includes(wasmRef.slice(2)));
 }
 assert(!app.includes('/fend/assets/'));assert(!worker.includes('/fend/assets/'));
});

test('missing upstream assets abort path patching before any output is changed', async () => {
 const dir=await mkdtemp(join(tmpdir(),'fend-paths-'));
 try {
  await cp('assets',join(dir,'assets'),{recursive:true});
  const names=await readdir(join(dir,'assets'));
  const worker=join(dir,'assets',names.find(name=>/^worker-.*\.js$/.test(name)));
  const source=(await readFile(worker,'utf8')).replace(/\/fend\/assets\/fend_wasm_bg-[^"]+\.wasm/,'/fend/assets/fend_wasm_bg-missing.wasm');
  await writeFile(worker,source);
  const before=new Map(await Promise.all(names.map(async name=>[name,await readFile(join(dir,'assets',name))])));
  assert.throws(()=>execFileSync(process.execPath,['scripts/patch-asset-paths.mjs',dir],{stdio:'pipe'}),/missing asset/);
  for(const [name,bytes] of before)assert.deepEqual(await readFile(join(dir,'assets',name)),bytes);
 } finally {await rm(dir,{recursive:true,force:true});}
});
