import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, cp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const version = (await readdir('www/assets'))[0];
const assets = join('www/assets', version);
const appName = (await readdir(assets)).find(name => /^App-.*\.js$/.test(name));
const app = await readFile(join(assets, appName), 'utf8');
const rateRegion = app.match(/\/\/#region src\/lib\/exchange-rates\.ts\n([\s\S]*?)\/\/#endregion/)[1];

test('bundled rates and real WASM calculate offline without a rates request', async () => {
	assert.doesNotMatch(rateRegion, /fetch\(/);
	const rateContext = vm.createContext({});
	vm.runInContext(rateRegion, rateContext);
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
		assert.throws(() => execFileSync(process.execPath, ['scripts/patch-rates.mjs', dir], { stdio: 'pipe' }), /missing required currencies/);
	} finally { await rm(dir, { recursive: true, force: true }); }
});

test('scheduled refresh saves changed rates and reports unchanged snapshots', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'fend-refresh-'));
	try {
		await mkdir(join(dir, 'scripts'));
		await cp('scripts/fetch-rates.mjs', join(dir, 'scripts', 'fetch-rates.mjs'));
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
