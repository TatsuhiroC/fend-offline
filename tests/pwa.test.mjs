import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, cp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { Worker as NodeWorker } from 'node:worker_threads';

const version = (await readdir('www/assets'))[0];
const assets = join('www/assets', version);
const appName = (await readdir(assets)).find(name => /^App-.*\.js$/.test(name));
const app = await readFile(join(assets, appName), 'utf8');
const rateRegion = app.match(/\/\/#region src\/lib\/exchange-rates\.ts\n([\s\S]*?)\/\/#endregion/)[1];

test('published output omits duplicate snapshots, unused helpers and broken debug links', async () => {
	assert.equal((await readdir('www')).includes('exchange-rates.xml'), false);
	const sw = await readFile('www/sw.js', 'utf8');
	assert.doesNotMatch(sw, /exchange-rates\.xml/);
	assert.doesNotMatch(app, /\b(?:WaitGroup|abortPromise|BarsFade|ThreeDotsScaleMiddle)\b/);
	for (const name of (await readdir(assets)).filter(name => name.endsWith('.js'))) {
		assert.doesNotMatch(await readFile(join(assets, name), 'utf8'), /sourceMappingURL=/);
	}
	// The checked-in snapshot remains available for the next build/refresh.
	assert.match(await readFile('exchange-rates.xml', 'utf8'), /UN_OPERATIONAL_RATES/);
});

test('retained loading animation renders exactly like the upstream component', async () => {
	const upstream = await readFile(join('assets', appName), 'utf8');
	const render = (source, props) => {
		const start = source.indexOf('var import_dist = ');
		const end = source.indexOf('\nfunction PendingOutput(', start);
		const react = { createElement: (tag, attributes, ...children) => ({ tag, attributes, children }) };
		const context = vm.createContext({
			require_react: () => react,
			__toESM: value => ({ default: value }),
			__commonJSMin: callback => () => {
				const module = { exports: {} };
				callback(module.exports, module);
				return module.exports;
			}, props
		});
		vm.runInContext(source.slice(start, end), context);
		return JSON.parse(vm.runInContext('JSON.stringify(import_dist.ThreeDotsScale(props))', context));
	};
	for (const props of [{}, { width: 40, height: 32, dur: '2s', color: '#123456' }]) {
		assert.deepEqual(render(app, props), render(upstream, props));
	}
});

test('cleanup rejects a changed upstream animation consumer before rewriting the app', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'fend-cleanup-'));
	try {
		await cp('assets', join(dir, 'assets'), { recursive: true });
		await cp('exchange-rates.xml', join(dir, 'exchange-rates.xml'));
		execFileSync(process.execPath, ['scripts/patch-rates.mjs', dir]);
		const path = join(dir, 'assets', appName);
		const source = await readFile(path, 'utf8');
		for (const component of ['BarsFade', 'ThreeDotsScaleMiddle']) {
			const changed = source.replace('import_dist.ThreeDotsScale,', `import_dist.${component},`);
			await writeFile(path, changed);
			assert.throws(() => execFileSync(process.execPath, ['scripts/patch-runtime.mjs', dir], { stdio: 'pipe' }), /spinner consumers changed/);
			assert.equal(await readFile(path, 'utf8'), changed);
		}
	} finally { await rm(dir, { recursive: true, force: true }); }
});

function ratesContext(options = {}) {
	const saved = new Map();
	const context = vm.createContext({ AbortController, TextDecoder, setTimeout, clearTimeout,
		fetch: async () => { throw new Error('offline'); },
		localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
		...options });
	vm.runInContext(rateRegion, context);
	return context;
}
function onlineFixture(context, rate = 7.25) {
	return { date: new Date().toISOString().slice(0, 10), usd:
		{ ...Object.fromEntries([...context.bundledExchangeRates].map(([code, value]) => [code.toLowerCase(), value])), cny: rate } };
}

test('bundled rates and real WASM calculate offline', async () => {
	const rateContext = ratesContext();
	await rateContext.refreshExchangeRates();
	const rates = await rateContext.getExchangeRates();
	const saved = { self: globalThis.self, addEventListener: globalThis.addEventListener,
		postMessage: globalThis.postMessage, fetch: globalThis.fetch };
	let messageHandler;
	const messages = [];
	try {
		globalThis.self = globalThis;
		globalThis.addEventListener = (event, fn) => { if (event === 'message') messageHandler = fn; };
		globalThis.postMessage = message => messages.push(message);
		globalThis.fetch = async url => {
			assert.match(String(url), /\.wasm$/);
			return new Response(await readFile(new URL(url)), { headers: { 'Content-Type': 'application/wasm' } });
		};
		const workerName = (await readdir(assets)).find(name => /^worker-.*\.js$/.test(name));
		await import(pathToFileURL(join(process.cwd(), assets, workerName)));
		assert.equal(messages.pop(), 'ready');
		for (const [input, expected] of [
			['87 fahrenheit to celsius', 'approx. 30.5555555556 celsius'],
			['87 °F to °C', 'approx. 30.5555555556 °C'],
			['100 USD to CNY', `${100 * rates.get('CNY')} CNY`],
			['100 CNY to USD', /^approx\. .* USD$/],
			['1 + 1', '2']
		]) {
			messageHandler({ data: { input, timeout: 1000, variables: '', currencyData: rates } });
			const result = messages.pop();
			assert.equal(result.ok, true, input);
			if (expected instanceof RegExp) assert.match(result.result, expected);
			else assert.equal(result.result, expected, input);
		}
	} finally { Object.assign(globalThis, saved); }
});

test('online rates take priority, refresh on each request, and persist for offline relaunch', async () => {
	const context = ratesContext();
	await context.refreshExchangeRates();
	let fixture = onlineFixture(context);
	let calls = 0;
	context.fetch = async (_, options) => {
		assert.equal(options.cache, 'no-store');
		calls++;
		return { ok: true, text: async () => JSON.stringify(fixture) };
	};
	assert.equal((await context.refreshExchangeRates()).get('CNY'), 7.25);
	assert.equal(context.exchangeRatesSource, 'online');
	fixture = onlineFixture(context, 7.5);
	assert.equal((await context.refreshExchangeRates()).get('CNY'), 7.5);
	assert.equal(calls, 4, 'each refresh races both mirrors');
	const restored = ratesContext({ localStorage: context.localStorage });
	assert.equal((await restored.getExchangeRates()).get('CNY'), 7.5);
	await restored.refreshExchangeRates();
	assert.equal(restored.exchangeRatesSource, 'saved');
});

test('broken primary mirror uses secondary; invalid responses keep last good rates', async () => {
	const context = ratesContext();
	await context.refreshExchangeRates();
	const fixture = onlineFixture(context);
	const urls = [];
	context.fetch = async url => {
		urls.push(url);
		if (url.includes('jsdelivr')) throw new Error('primary unavailable');
		return { ok: true, text: async () => JSON.stringify(fixture) };
	};
	assert.equal((await context.refreshExchangeRates()).get('CNY'), 7.25);
	assert.equal(urls.length, 2);
	for (const bad of [{}, { ...fixture, usd: { USD: 1 } }, { ...fixture, usd: { ...fixture.usd, cny: -1 } }, { ...fixture, date: '2026-02-30' }]) {
		context.fetch = async () => ({ ok: true, text: async () => JSON.stringify(bad) });
		assert.equal((await context.refreshExchangeRates()).get('CNY'), 7.25);
		assert.equal(context.exchangeRatesSource, 'saved');
	}
	const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
	context.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ ...fixture, date: yesterday, usd: { ...fixture.usd, cny: 6 } }) });
	assert.equal((await context.refreshExchangeRates()).get('CNY'), 7.25, 'an old mirror must not overwrite newer saved rates');
});

test('slow requests fall back within deadline, share in-flight work, and recover', async () => {
	const context = ratesContext({ setTimeout: fn => setTimeout(fn, 20) });
	await context.refreshExchangeRates();
	let calls = 0, completeLate;
	context.fetch = () => { calls++; return new Promise(resolve => { completeLate = resolve; }); };
	const first = context.refreshExchangeRates();
	const second = context.refreshExchangeRates();
	const [a, b] = await Promise.all([first, second]);
	assert.equal(a.get('CNY'), context.bundledExchangeRates.get('CNY'));
	assert.equal(a, b);
	assert(calls <= 2, 'concurrent callers must share one primary/mirror request sequence');
	const fixture = onlineFixture(context);
	context.fetch = async () => ({ ok: true, text: async () => JSON.stringify(fixture) });
	assert.equal((await context.refreshExchangeRates()).get('CNY'), 7.25);
	completeLate({ ok: true, text: async () => JSON.stringify(onlineFixture(context, 99)) });
	await new Promise(resolve => setImmediate(resolve));
	assert.equal((await context.getExchangeRates()).get('CNY'), 7.25);
});

test('blocked browser storage does not prevent online conversion', async () => {
	const context = ratesContext({ localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } } });
	await context.refreshExchangeRates();
	context.fetch = async () => ({ ok: true, text: async () => JSON.stringify(onlineFixture(context)) });
	assert.equal((await context.refreshExchangeRates()).get('CNY'), 7.25);
	assert.equal(context.exchangeRatesSource, 'online');
});

test('temperature and arithmetic never wait for rates; currency submission refreshes but hints do not', async () => {
	const context = ratesContext();
	await context.refreshExchangeRates();
	let finishFetch;
	context.fetch = () => new Promise(resolve => { finishFetch = resolve; });
	const pending = context.refreshExchangeRates();
	const started = Date.now();
	class FakeWorker {
		constructor() { queueMicrotask(() => this.onmessage({ data: 'ready' })); }
		terminate() {}
		postMessage(args) { queueMicrotask(() => this.onmessage({ data: { ok: true, result:
			args.input.includes('celsius') ? 'approx. 30.5555555556 celsius' :
			args.input.includes('USD') ? `${100 * args.currencyData.get('CNY')} CNY` : '2' } })); }
	}
	context.WorkerWrapper = FakeWorker;
	context.console = console;
	vm.runInContext(app.match(/function newAbortError\(message\) \{[\s\S]*?(?=\/\/#endregion)/)[0], context);
	assert.equal((await context.fend('87 fahrenheit to celsius', 1000, '')).result, 'approx. 30.5555555556 celsius');
	assert.equal((await context.fend('1 + 1', 1000, '')).result, '2');
	assert.equal((await context.fend('100 USD to CNY', 100, '', false)).result, `${100 * context.bundledExchangeRates.get('CNY')} CNY`);
	assert(Date.now() - started < 1000, 'temperature, arithmetic and hints must not wait for the rates timeout');
	const submitted = context.fend('100 USD to CNY', 1000, '');
	finishFetch({ ok: true, text: async () => JSON.stringify(onlineFixture(context, 7.25)) });
	await pending;
	// The submission can start its own new refresh once the prefetch completes.
	context.fetch = async () => ({ ok: true, text: async () => JSON.stringify(onlineFixture(context, 7.25)) });
	assert.equal((await submitted).result, '725 CNY');
});

test('worker startup errors and timeouts settle calculations and permit retry', async () => {
	let startup = 'fail', timer;
	class FakeWorker {
		constructor() { queueMicrotask(() => {
			if (this.stopped || startup === 'stall') return;
			if (startup === 'ready') this.onmessage({ data: 'ready' });
			else this.onerror({ message: 'WASM unavailable' });
		}); }
		terminate() { this.stopped = true; }
		postMessage() { queueMicrotask(() => this.onmessage({ data: { ok: true, result: '2' } })); }
	}
	const context = vm.createContext({ WorkerWrapper: FakeWorker, console,
		setTimeout: fn => { timer = fn; return 1; }, clearTimeout() {} });
	const wrapper = app.match(/function newAbortError\(message\) \{[\s\S]*?(?=\/\/#endregion)/)[0];
	vm.runInContext(wrapper, context);
	await assert.rejects(context.query({}), /WASM unavailable/);
	startup = 'ready';
	assert.equal((await context.query({})).result, '2');
	startup = 'stall';
	const stalled = context.init();
	timer();
	await assert.rejects(stalled.initialisedPromise, /startup timed out/);
});

test('real WASM uses changed rates in the same session and keeps calculator variables', async () => {
	const workerName = (await readdir(assets)).find(name => /^worker-.*\.js$/.test(name));
	let starts = 0;
	class NativeWorkerWrapper {
		constructor() {
			starts++;
			this.native = new NodeWorker(`
const { parentPort, workerData } = require('node:worker_threads');
const { readFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
globalThis.self = globalThis;
globalThis.addEventListener = (event, callback) => { if (event === 'message') parentPort.on('message', data => callback({ data })); };
globalThis.postMessage = data => parentPort.postMessage(data);
globalThis.fetch = async url => new Response(await readFile(new URL(url)), { headers: { 'Content-Type': 'application/wasm' } });
import(pathToFileURL(workerData));`, { eval: true, workerData: join(process.cwd(), assets, workerName) });
			this.native.on('message', data => this.onmessage?.({ data }));
			this.native.on('error', error => this.onerror?.({ message: error.message }));
		}
		postMessage(data) { this.native.postMessage(data); }
		terminate() { return this.native.terminate(); }
	}
	const context = vm.createContext({ WorkerWrapper: NativeWorkerWrapper, console, setTimeout, clearTimeout });
	vm.runInContext(app.match(/function newAbortError\(message\) \{[\s\S]*?(?=\/\/#endregion)/)[0], context);
	try {
		const first = await context.query({ input: '100 USD to CNY', timeout: 1000, variables: '', currencyData: new Map([['USD', 1], ['CNY', 7.25]]) });
		assert.equal(first.result, '725 CNY');
		const assigned = await context.query({ input: 'x = 100 USD', timeout: 1000, variables: first.variables, currencyData: new Map([['USD', 1], ['CNY', 7.25]]) });
		assert.equal(assigned.result, '100 USD');
		const second = await context.query({ input: 'x to CNY', timeout: 1000, variables: assigned.variables, currencyData: new Map([['USD', 1], ['CNY', 7.5]]) });
		assert.equal(second.result, '750 CNY');
		assert.equal(starts, 2);
		const third = await context.query({ input: 'x to CNY', timeout: 1000, variables: second.variables, currencyData: new Map([['CNY', 7.5], ['USD', 1]]) });
		assert.equal(third.result, '750 CNY');
		assert.equal(starts, 2, 'equal rates must reuse the existing engine');
	} finally { await context.workerCache.worker.terminate(); }
});

test('changed assets get new URLs, identical assets keep stable URLs', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'fend-assets-'));
	try {
		const versions = [];
		for (const content of ['one', 'one', 'two']) {
			await rm(join(dir, 'assets'), { recursive: true, force: true });
			await mkdir(join(dir, 'assets'));
			await writeFile(join(dir, 'assets', 'app.js'), content);
			await writeFile(join(dir, 'index.html'), '<script src="assets/app.js"></script>');
			execFileSync(process.execPath, ['scripts/version-assets.mjs', dir]);
			versions.push((await readdir(join(dir, 'assets')))[0]);
			assert.match(await readFile(join(dir, 'index.html'), 'utf8'), new RegExp(`assets/${versions.at(-1)}/app.js`));
		}
		assert.equal(versions[0], versions[1]);
		assert.notEqual(versions[1], versions[2]);
	} finally { await rm(dir, { recursive: true, force: true }); }
});

test('invalid exchange-rate snapshots fail the build', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'fend-rates-'));
	try {
		await cp('assets', join(dir, 'assets'), { recursive: true });
		await writeFile(join(dir, 'exchange-rates.xml'), '<html>temporarily unavailable</html>');
		assert.throws(() => execFileSync(process.execPath, ['scripts/patch-rates.mjs', dir], { stdio: 'pipe' }), /Invalid|missing required currencies/i);
	} finally { await rm(dir, { recursive: true, force: true }); }
});

test('scheduled refresh saves changed rates and reports unchanged snapshots', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'fend-refresh-'));
	try {
		await mkdir(join(dir, 'scripts'));
		await cp('scripts/fetch-rates.mjs', join(dir, 'scripts', 'fetch-rates.mjs'));
		await cp('scripts/snapshot-data.mjs', join(dir, 'scripts', 'snapshot-data.mjs'));
		const snapshot = await readFile('exchange-rates.xml', 'utf8');
		await writeFile(join(dir, 'incoming.xml'), snapshot);
		// Stub only the network response; execute the real refresh script against its
		// own temporary repo so the checked-in rate snapshot cannot be changed.
		const stub = join(dir, 'fetch-stub.mjs');
		await writeFile(stub, `import { readFile } from 'node:fs/promises';
globalThis.fetch = async () => new Response(await readFile(new URL('./incoming.xml', import.meta.url)), { status: 200 });`);
		const run = () => execFileSync(process.execPath, ['--import', stub, join(dir, 'scripts', 'fetch-rates.mjs')], { encoding: 'utf8' });
		assert.match(run(), /\(updated\)/);
		assert.equal(await readFile(join(dir, 'exchange-rates.xml'), 'utf8'), snapshot);
		assert.match(run(), /\(unchanged\)/);
		const next = snapshot.replace(/<rate>([^<]+)<\/rate>/, (_, rate) => `<rate>${Number(rate) + 1}</rate>`);
		assert.notEqual(next, snapshot);
		await writeFile(join(dir, 'incoming.xml'), next);
		assert.match(run(), /\(updated\)/);
		assert.equal(await readFile(join(dir, 'exchange-rates.xml'), 'utf8'), next);
	} finally { await rm(dir, { recursive: true, force: true }); }
});

test('a healthy 6-second response survives when the other mirror returns 403', async () => {
 const context = ratesContext();
 await context.refreshExchangeRates();
 const urls = [];
 let finishPrimary;
 context.fetch = (url, options) => {
  urls.push(url);
  if (url.includes('jsdelivr')) return new Promise(resolve => { finishPrimary = resolve; });
  return Promise.resolve({ ok: false, status: 403 });
 };
 const pending = context.refreshExchangeRates();
 assert.equal(urls.length, 2, 'both mirrors must start before either responds');
 assert.equal(context.currencyRefreshing, true);
 assert.equal(context.currencyFetchTimeout, 15000);
 await new Promise(resolve => setTimeout(resolve, 6100));
 assert.equal(context.currencyRefreshing, true, 'do not abort a usable connection at 1.5 or 3 seconds');
 const fixture = onlineFixture(context);
 fixture.usd.sgd = 1.28041753;
 finishPrimary({ ok: true, text: async () => JSON.stringify(fixture) });
 const result = await pending;
 assert.equal(result.get('SGD'), 1.28041753);
 assert.equal(context.exchangeRatesSource, 'online');
 assert.equal(context.currencyRefreshing, false);
 assert.equal(context.currencyFailure, '');
});

test('timeouts abort all mirrors, identify local fallback and allow a fresh request', async () => {
 const signals = [];
 const context = ratesContext({ setTimeout: fn => setTimeout(fn, 20) });
 await context.refreshExchangeRates();
 context.fetch = (_, options) => { signals.push(options.signal); return new Promise(() => {}); };
 const result = await context.refreshExchangeRates();
 assert.equal(result.get('SGD'), 1.279);
 assert.equal(signals.length, 2);
 assert(signals.every(signal => signal.aborted));
 assert.equal(context.currencyFailure, 'timeout');
 assert.equal(context.currencyRefreshing, false);
 context.fetch = async () => ({ ok: true, text: async () => JSON.stringify(onlineFixture(context)) });
 await context.refreshExchangeRates();
 assert.equal(context.exchangeRatesSource, 'online');
 assert.equal(context.currencyFailure, '');
});

test('a winning mirror aborts the loser, whose later response cannot change saved data', async () => {
 const context = ratesContext();
 await context.refreshExchangeRates();
 const signals = [];
 let finishLoser;
 context.fetch = (url, options) => {
  signals.push(options.signal);
  if (url.includes('jsdelivr')) return new Promise(resolve => { finishLoser = resolve; });
  return Promise.resolve({ ok: true, text: async () => JSON.stringify(onlineFixture(context, 7.5)) });
 };
 assert.equal((await context.refreshExchangeRates()).get('CNY'), 7.5);
 assert(signals.every(signal => signal.aborted));
 finishLoser({ ok: true, text: async () => JSON.stringify(onlineFixture(context, 99)) });
 await new Promise(resolve => setImmediate(resolve));
 assert.equal((await context.getExchangeRates()).get('CNY'), 7.5);
 assert.equal(context.exchangeRatesSource, 'online');
});
