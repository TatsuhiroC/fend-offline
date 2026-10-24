import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import vm from 'node:vm';

const dir = join('www/assets', (await readdir('www/assets'))[0]);
const files = await readdir(dir);
const app = await readFile(join(dir, files.find(n => /^App-.*\.js$/.test(n))), 'utf8');
const workerPath = join(process.cwd(), dir, files.find(n => /^worker-.*\.js$/.test(n)));
class RealWorker {
 constructor() {
  this.native = new Worker(`
const {parentPort,workerData}=require('node:worker_threads');
const {readFile}=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
globalThis.self=globalThis;
globalThis.addEventListener=(name,handler)=>{if(name==='message')parentPort.on('message',data=>handler({data}));};
globalThis.postMessage=data=>parentPort.postMessage(data);
globalThis.fetch=async url=>new Response(await readFile(new URL(url)),{headers:{'Content-Type':'application/wasm'}});
import(pathToFileURL(workerData));`, {eval:true, workerData:workerPath});
  this.native.on('message', data => this.onmessage?.({data}));
  this.native.on('error', error => this.onerror?.({message:error.message}));
 }
 postMessage(args) {this.native.postMessage(args);}
 terminate() {return this.native.terminate();}
}
export async function calculator() {
 const context = vm.createContext({WorkerWrapper:RealWorker, AbortController, TextDecoder, setTimeout, clearTimeout, console,
  fetch:async () => {throw new Error('offline');}, localStorage:{getItem:() => null, setItem() {}}});
 vm.runInContext(app.match(/\/\/#region src\/lib\/exchange-rates\.ts\n([\s\S]*?)\/\/#endregion/)[1], context);
 vm.runInContext(app.match(/function newAbortError\(message\) \{[\s\S]*?(?=\/\/#endregion)/)[0], context);
 await context.refreshExchangeRates();
 const fixture = {date:new Date().toISOString().slice(0,10), usd:Object.fromEntries([...context.bundledExchangeRates].map(([c,r]) => [c.toLowerCase(),r]))};
 Object.assign(fixture.usd, {pln:4, try:40, cny:7.5});
 let requests = 0, variables = '';
 context.fetch = async () => {requests++; return new Response(JSON.stringify(fixture));};
 return {
  context,
  setCny(rate) {fixture.usd.cny = rate;},
  async evaluate(input, {fresh = true, timeout = 1000} = {}) {
   requests = 0;
   const result = await context.fend(input,timeout,variables,fresh);
   if (fresh && result.ok) variables = result.variables;
   return result;
  },
  async run(input, fresh = true) {
   const result = await this.evaluate(input, {fresh});
   assert.equal(result.ok,true,input + ': ' + result.message);
   return {result:result.result, requests};
  },
  async close() {await context.workerCache?.worker.terminate();}
 };
}

