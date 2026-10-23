import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkVendor, auditVendor } from '../scripts/check-vendor.mjs';

test('vendored asset changes require a reviewed inventory update', async () => {
 const dir = await mkdtemp(join(tmpdir(),'fend-vendor-'));
 try {
  await cp('assets',join(dir,'assets'),{recursive:true});
  await cp('vendor-manifest.json',join(dir,'vendor-manifest.json'));
  const manifest = await checkVendor(dir);
  const wasm = Object.keys(manifest.files).find(name=>name.endsWith('.wasm'));
  const bytes = await readFile(join(dir,wasm));
  bytes[bytes.length-1] ^= 1;
  await writeFile(join(dir,wasm),bytes);
  await assert.rejects(checkVendor(dir),/hash mismatch/);
  await writeFile(join(dir,'assets/unreviewed.js'),'/* new dependency */');
  await assert.rejects(checkVendor(dir),/inventory changed/);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('vendor audit checks shipped package versions and fails on advisories or unavailable data', async () => {
 const manifest = await checkVendor();
 await auditVendor(manifest, async (url,options) => {
  assert.equal(url,'https://api.osv.dev/v1/querybatch');
  const {queries} = JSON.parse(options.body);
  assert.deepEqual(queries.map(query=>query.package.name),['react','react-dom','scheduler','react-svg-spinners','fend-core','wasm-bindgen','js-sys']);
  assert.deepEqual(queries.map(query=>query.version),['19.3.1','19.3.1','0.28.0','0.3.1','1.5.9','0.2.129','0.3.106']);
  return Response.json({results:queries.map(()=>({}))});
 });
 await assert.rejects(auditVendor(manifest,async()=>Response.json({results:manifest.components.map((_,i)=>i===0?{vulns:[{id:'TEST-CLIENT-ADVISORY'}]}:{})})),/react@19.3.1: TEST-CLIENT-ADVISORY/);
 await assert.rejects(auditVendor(manifest,async()=>new Response('',{status:503})),/HTTP 503/);
 await assert.rejects(auditVendor(manifest,async()=>Response.json({results:[]})),/Invalid/);
});
