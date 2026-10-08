import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseSnapshot } from '../scripts/snapshot-data.mjs';

const version = (await readdir('www/assets'))[0];
const names = await readdir(join('www/assets', version));
const app = await readFile(join('www/assets', version, names.find(n => /^App-.*\.js$/.test(n))), 'utf8');
const wrapper = app.match(/function newAbortError\(message\) \{[\s\S]*?(?=\/\/#endregion)/)[0];
const rates = app.match(/\/\/#region src\/lib\/exchange-rates\.ts\n([\s\S]*?)\/\/#endregion/)[1];
const silent = { warn() {}, error() {}, log() {} };

function runtime(WorkerWrapper, extra = {}) {
 const context = vm.createContext({ WorkerWrapper, console: silent, setTimeout, clearTimeout, ...extra });
 vm.runInContext(wrapper, context);
 return context;
}

test('blocked Worker construction and failed postMessage return errors and allow retry', async () => {
 let mode = 'constructor';
 class Worker {
  constructor() { if (mode === 'constructor') throw new Error('Worker blocked'); queueMicrotask(() => this.onmessage({ data: 'ready' })); }
  terminate() {}
  postMessage() { if (mode === 'post') throw new Error('Message failed'); queueMicrotask(() => this.onmessage({ data: { ok: true, result: '2' } })); }
 }
 const context = runtime(Worker);
 await assert.rejects(context.query({}), /Worker blocked/);
 mode = 'post';
 await assert.rejects(context.query({}), /Message failed/);
 mode = 'ready';
 assert.equal((await context.query({})).result, '2');
});

test('hints cannot interrupt a submission; clearing cancels pending rate results', async () => {
 let finishRates;
 const data = new Map([['USD', 1], ['CNY', 7]]);
 class Worker {
  constructor() { queueMicrotask(() => this.onmessage({ data: 'ready' })); }
  terminate() {}
  postMessage() { queueMicrotask(() => this.onmessage({ data: { ok: true, result: '700 CNY' } })); }
 }
 const context = runtime(Worker, { getExchangeRates: async () => data, usesCurrency: () => true,
  refreshExchangeRates: () => new Promise(resolve => { finishRates = resolve; }) });
 const submitted = context.fend('100 USD to CNY', 1000, '');
 await new Promise(resolve => setImmediate(resolve));
 assert.equal((await context.fend('1 + 1', 100, '', false)).message, 'cancelled');
 context.cancelCalculations();
 finishRates(data);
 assert.equal((await submitted).message, 'cancelled');
});

test('an older currency submission cannot replace a newer result after rates arrive', async () => {
 let finishRates;
 const data = new Map([['USD', 1], ['CNY', 7]]);
 class Worker {
  constructor() { queueMicrotask(() => this.onmessage({ data: 'ready' })); }
  terminate() {}
  postMessage(args) { queueMicrotask(() => this.onmessage({ data: { ok: true, result: args.input } })); }
 }
 const context = runtime(Worker, { getExchangeRates: async () => data, usesCurrency: input => input.includes('USD'),
  refreshExchangeRates: () => new Promise(resolve => { finishRates = resolve; }) });
 const older = context.fend('100 USD to CNY', 1000, '');
 await new Promise(resolve => setImmediate(resolve));
 assert.equal((await context.fend('1 + 1', 1000, '')).result, '1 + 1');
 finishRates(data);
 assert.equal((await older).message, 'cancelled');
});

test('corrupted, unexpected and blocked history storage cannot crash startup', () => {
 const history = app.match(/var initialHistory = \(\(\) => \{[\s\S]*?\}\)\(\);/)[0];
 for (const value of ['{bad', 'null', '{}', '[null,42,"1+1"]', JSON.stringify(Array(120).fill('2+2'))]) {
  const context = vm.createContext({ localStorage: { getItem: () => value } });
  vm.runInContext(history, context);
  assert(context.initialHistory.length <= 100);
  assert(context.initialHistory.every(v => typeof v === 'string'));
 }
 const blocked = vm.createContext({ localStorage: { getItem() { throw new Error('blocked'); } } });
 vm.runInContext(history, blocked);
 assert.equal(blocked.initialHistory.length, 0);
});

test('oversized online streams are cancelled and cannot replace good rates', async () => {
 const context = vm.createContext({ AbortController, TextDecoder, setTimeout, clearTimeout,
  fetch: async () => { throw new Error('offline'); }, localStorage: { getItem: () => null, setItem() {} } });
 vm.runInContext(rates, context);
 await context.refreshExchangeRates();
 let cancelled = 0;
 context.fetch = async () => ({ ok: true, body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(129 * 1024) }), cancel: async () => cancelled++ }) } });
 assert.equal((await context.refreshExchangeRates()).get('CNY'), context.bundledExchangeRates.get('CNY'));
 assert.equal(cancelled, 2);
 assert.equal(context.exchangeRatesSource, 'bundled');
});

test('a stalled primary endpoint leaves time for a working mirror', async () => {
 const context = vm.createContext({ AbortController, TextDecoder, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 25)), clearTimeout,
  fetch: async () => { throw new Error('offline'); }, localStorage: { getItem: () => null, setItem() {} } });
 vm.runInContext(rates, context);
 await context.refreshExchangeRates();
 const fixture = { date: new Date().toISOString().slice(0, 10), usd: Object.fromEntries([...context.bundledExchangeRates].map(([c,v]) => [c.toLowerCase(),v])) };
 fixture.usd.cny = 7.5;
 // Keep the global 3s deadline while accelerating the primary 1.5s timeout.
 context.setTimeout = (fn, ms) => setTimeout(fn, ms >= 2900 ? 1000 : 10);
 context.fetch = async url => url.includes('jsdelivr') ? new Promise(() => {}) : { ok: true, text: async () => JSON.stringify(fixture) };
 assert.equal((await context.refreshExchangeRates()).get('CNY'), 7.5);
});

async function serviceWorker(overrides = {}) {
 const handlers = {};
 const context = vm.createContext({ URL, AbortController, setTimeout, clearTimeout, Response, console: silent,
  self: { location: { origin: 'https://example.test' }, registration: { scope: 'https://example.test/fend/' },
   addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { claim: async () => {} } }, ...overrides });
 vm.runInContext(await readFile('www/sw.js', 'utf8'), context);
 return handlers;
}

test('PWA cache failures fall back to network and offline navigation ignores query strings', async () => {
 for (const failure of ['open', 'match']) {
  const handlers = await serviceWorker({ caches: { open: async () => {
   if (failure === 'open') throw new Error('cache blocked');
   return { match: async () => { throw new Error('read blocked'); }, put: async () => {} };
  } }, fetch: async () => new Response('network') });
  let response;
  handlers.fetch({ request: { method: 'GET', url: 'https://example.test/fend/index.html', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'network');
 }
 const handlers = await serviceWorker({ caches: { open: async () => ({ match: async (request, options) => {
  assert.equal(options.ignoreSearch, true); return new Response('offline');
 } }) }, fetch: () => assert.fail('cached navigation must not need network') });
 let response;
 handlers.fetch({ request: { method: 'GET', url: 'https://example.test/fend/index.html?launch=pwa', mode: 'navigate' }, respondWith: promise => { response = promise; } });
 assert.equal(await (await response).text(), 'offline');
});

test('cache cleanup preserves other apps on the same origin', async () => {
 const keys = new Set(['fend:https://example.test/fend/:old', 'fend:https://example.test/other/:old', 'fend-legacy-own', 'fend-legacy-other', 'unrelated']);
 const handlers = await serviceWorker({ caches: { keys: async () => [...keys], delete: async key => keys.delete(key), open: async key => ({ keys: async () => [{ url: key.endsWith('own') ? 'https://example.test/fend/index.html' : 'https://example.test/other/index.html' }] }) } });
 let pending;
 handlers.activate({ waitUntil: promise => { pending = promise; } });
 await pending;
 assert.deepEqual([...keys], ['fend:https://example.test/other/:old', 'fend-legacy-other', 'unrelated']);
});

test('snapshot validation rejects malformed dates, truncated XML and oversized data', async () => {
 const xml = await readFile('exchange-rates.xml', 'utf8');
 assert.equal(parseSnapshot(xml).rates.size, 151);
 assert.throws(() => parseSnapshot(xml.replace(/<eff_date>[^<]+/, '<eff_date>31 Feb 2026')), /date/);
 assert.throws(() => parseSnapshot(xml.slice(0, -50)), /Invalid/);
 assert.throws(() => parseSnapshot(xml + ' '.repeat(512 * 1024)), /oversized/);
});

test('release metadata rejects missing secrets and command injection; repeated preparation updates version', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'fend-release-'));
 const original = 'android { defaultConfig { versionCode 1 } }\n';
 const env = { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.0.2', GITHUB_RUN_NUMBER: '20',
  GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', ANDROID_KEYSTORE_BASE64: '', ANDROID_KEYSTORE_PASSWORD: '', ANDROID_KEY_ALIAS: '', ANDROID_KEY_PASSWORD: '' };
 try {
  await mkdir(join(dir, 'app')); await writeFile(join(dir, 'app/build.gradle'), original);
  const run = e => execFileSync(process.execPath, ['scripts/prepare-android.mjs', dir], { env: e, stdio: 'pipe' });
  assert.throws(() => run(env), /require all four/);
  assert.equal(await readFile(join(dir, 'app/build.gradle'), 'utf8'), original);
  assert.throws(() => run({ ...env, GITHUB_REF_NAME: 'v1.0.2\"; malicious()' }), /semantic version/);
  const signed = { ...env, ANDROID_KEYSTORE_BASE64: Buffer.alloc(128).toString('base64'), ANDROID_KEYSTORE_PASSWORD: '密碼=pass', ANDROID_KEY_ALIAS: 'test', ANDROID_KEY_PASSWORD: 'test' };
  run(signed); run({ ...signed, GITHUB_RUN_NUMBER: '21' });
  const gradle = await readFile(join(dir, 'app/build.gradle'), 'utf8');
  assert.equal((gradle.match(/versionCode 1000/g) || []).length, 1);
  assert.match(gradle, /versionCode 100021/);
  assert.match(await readFile(join(dir, 'keystore.properties'), 'utf8'), /\\u5bc6\\u78bc\\=pass/);
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('keystore helper never logs credentials, creates private files and refuses overwrite', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'fend-key-helper-'));
 try {
  const bin = join(dir, 'bin'); await mkdir(bin);
  await writeFile(join(bin, 'keytool'), '#!/bin/sh\n[ "$1" = "-help" ] && exit 0\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "-keystore" ]; then shift; printf "FAKE_KEY_FOR_TEST" > "$1"; exit 0; fi; shift; done\nexit 1\n', { mode: 0o700 });
  const key = join(dir, 'test.jks');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, ANDROID_KEYSTORE_PASSWORD: 'TEST_PASSWORD_NEVER_PRINT', KEY_ALIAS: 'test' };
  const output = execFileSync('bash', ['scripts/make-keystore.sh', key], { env, encoding: 'utf8', stdio: 'pipe' });
  assert(!output.includes(env.ANDROID_KEYSTORE_PASSWORD));
  assert(!output.includes(Buffer.from('FAKE_KEY_FOR_TEST').toString('base64')));
  assert.equal((await stat(key)).mode & 0o777, 0o600);
  assert.equal((await stat(key + '.secrets')).mode & 0o777, 0o700);
  assert.equal((await stat(key + '.secrets/ANDROID_KEYSTORE_PASSWORD')).mode & 0o777, 0o600);
  assert.throws(() => execFileSync('bash', ['scripts/make-keystore.sh', key], { env, stdio: 'pipe' }), /Refusing to overwrite/);
  assert.equal(await readFile(key, 'utf8'), 'FAKE_KEY_FOR_TEST');
 } finally { await rm(dir, { recursive: true, force: true }); }
});
