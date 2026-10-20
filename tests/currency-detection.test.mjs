import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
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
async function calculator() {
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
  async run(input, fresh = true) {
   requests = 0;
   const result = await context.fend(input,1000,variables,fresh);
   if (fresh && result.ok) variables = result.variables;
   assert.equal(result.ok,true,input + ': ' + result.message);
   return {result:result.result, requests};
  },
  async close() {await context.workerCache?.worker.terminate();}
 };
}

test('real currency aliases refresh online rates on each submitted conversion', async () => {
 const calc = await calculator();
 try {
  for (const input of ['100 zł to TL','100 zl to ₺','100 TL to zł','100 ₺ to zl','100 PLN to TRY']) {
   const actual = await calc.run(input);
   assert.equal(actual.requests,2,input);
   assert.match(actual.result,/^(?:1000|10) (?:TL|zł|zl|TRY)$|^1000₺$/,input);
  }
 } finally {await calc.close();}
});

test('currency functions refresh even with string arguments and dimensionless output', async () => {
 const calc = await calculator();
 try {
  await calc.run('f = x: 100 USD to CNY');
  calc.setCny(8);
  assert.deepEqual(await calc.run('f("ignored")'), {result:'800 CNY', requests:2});
  await calc.run('ratio = x: (x USD) / (1 CNY)');
  calc.setCny(8.5);
  assert.deepEqual(await calc.run('ratio(1)'), {result:'8.5', requests:2});
  await calc.run('alias = ratio');
  calc.setCny(9);
  assert.deepEqual(await calc.run('alias(1)'), {result:'9', requests:2});
  assert.deepEqual(await calc.run('ans + 1'), {result:'10', requests:0},'a numeric answer must not retain the function dependency');
  assert.deepEqual(await calc.run('n = (1 USD) / (1 CNY)'), {result:'9', requests:2});
  assert.deepEqual(await calc.run('n + 1'), {result:'10', requests:0},'a stored numeric value is ordinary arithmetic');
 } finally {await calc.close();}
});

test('parenthesized bindings persist and function definitions do not shadow global currency units', async () => {
 const calc = await calculator();
 let unwantedRequests = 0;
 calc.context.fetch = async () => {unwantedRequests++; throw new Error('offline');};
 try {
  for (const [input, expected] of [
   ['(try = 2)','2'], ['try + 1','3'], ['((USD = 2))','2'], ['USD + 1','3'],
   ['(x = "100 USD")','100 USD'], ['x','100 USD'], ['ans','100 USD'],
   ['f = z: "USD"',null], ['f(1)','USD'], ['g = CNY: CNY + 1',null], ['g(2)','3'],
   ['h = z: (EUR = 2)',null]
  ]) {
   const actual = await calc.run(input);
   if (expected !== null) assert.equal(actual.result, expected, input);
   assert.equal(unwantedRequests, 0, input);
  }
  calc.context.fetch = async () => {unwantedRequests++; return new Response(JSON.stringify({date:new Date().toISOString().slice(0,10),usd:Object.fromEntries([...calc.context.bundledExchangeRates].map(([c,r])=>[c.toLowerCase(),r]))}));};
  await calc.run('100 CNY to EUR');
  assert.equal(unwantedRequests,2,'defining a function must not shadow global currency units');
 } finally {await calc.close();}
});

test('the real engine interrupts expensive calculations and accepts the next input', {timeout:5000}, async () => {
 const calc = await calculator();
 try {
  const result = await calc.context.fend('100000!',25,'');
  assert.equal(result.ok,false);
  assert.match(result.message,/interrupt|timed out/i);
  assert.equal((await calc.run('1 + 1')).result,'2');
 } finally {await calc.close();}
});

test('strings, comments and ordinary variables never wait for unavailable online rates', async () => {
 const calc = await calculator();
 let unwantedRequests = 0;
 calc.context.fetch = async () => {unwantedRequests++; throw new Error('offline');};
 try {
  for (const [input,expected] of [
   ['"USD"','USD'], ['ans','USD'], ["'100 USD'",'100 USD'], ['#"USD \" TL"#','USD " TL'],
   ['try = 2','2'], ['try + 1','3'], ['USD = 4','4'], ['100 USD','400'],
   ['x = "100 USD"','100 USD'], ['x','100 USD'], ['y = x','100 USD'], ['y','100 USD'],
   ['z = (("USD"))','USD'], ['z','USD'],
   ['1 + 1 # USD TL','2'], ['1 + 1 #! 100 EUR','2'], ["5'10\" to cm",'177.8 cm'],
   ['1 cup to ml','236.5882365 ml'], ['10 pounds to kg','4.5359237 kg']
  ]) {
   assert.equal((await calc.run(input)).result,expected,input);
   assert.equal(unwantedRequests,0,input + ' must not request rates');
  }
 } finally {await calc.close();}
});

test('monetary variables and comparisons still refresh, and previews do not change bindings', async () => {
 const calc = await calculator();
 try {
  assert.equal((await calc.run('amount = 100 USD')).requests,2);
  assert.equal((await calc.run('amount')).requests,2);
  assert.equal((await calc.run('ans')).requests,2,'a monetary ans still needs online rates');
  assert.equal((await calc.run('"USD"; amount')).requests,2,'an earlier string must not hide a monetary result');
  assert.equal((await calc.run('amount to CNY')).result,'750 CNY');
  assert.equal((await calc.run('1 USD == 1 CNY')).requests,2,'equality is not assignment');
  assert.equal((await calc.run('try = 2',false)).requests,0);
  assert.equal((await calc.run('100 try to PLN')).requests,2,'preview assignments must not shadow actual currencies');
  assert(calc.context.currencyBindings.size <= 3);
 } finally {await calc.close();}
});
