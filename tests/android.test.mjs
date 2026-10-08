import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

test('APK startup retires browser caching while preserving saved exchange rates', async () => {
	const source = (await readFile('www/index.html', 'utf8')).match(/<script>\n([\s\S]*?)<\/script>/)[1];
	let registered = 0, unregistered = 0, reloaded = 0;
	const keys = new Set(['fend-old', 'unrelated']);
	const storage = new Map([['fend-online-rates-v1', 'saved-rates']]);
	const cache = { keys: async () => [...keys], delete: async key => keys.delete(key) };
	const context = vm.createContext({
		window: { Capacitor: { isNativePlatform: () => true }, caches: cache, addEventListener() {} },
		navigator: { serviceWorker: { controller: {}, register: () => registered++,
			getRegistrations: async () => [{ unregister: async () => { unregistered++; return true; } }] } },
		caches: cache, localStorage: storage, console,
		location: { reload: () => reloaded++ }
	});
	vm.runInContext(source, context);
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(registered, 0);
	assert.equal(unregistered, 1);
	assert.equal(reloaded, 1);
	assert.deepEqual([...keys], ['unrelated']);
	assert.equal(storage.get('fend-online-rates-v1'), 'saved-rates');
});

test('a legacy APK worker upgrades immediately, unregisters itself and reloads packaged assets', async () => {
	const source = await readFile('www/sw.js', 'utf8');
	const handlers = {};
	const keys = new Set(['fend-old', 'unrelated']);
	let skipped = 0, unregistered = 0, opened = 0, navigated = 0;
	const context = vm.createContext({ console, self: {
		location: { origin: 'https://localhost' },
		addEventListener: (event, handler) => { handlers[event] = handler; },
		skipWaiting: async () => skipped++,
		registration: { scope: 'https://localhost/', unregister: async () => unregistered++ },
		clients: { claim: async () => {}, matchAll: async () => [{ url: 'https://localhost/', navigate: async () => navigated++ }] }
	}, caches: { keys: async () => [...keys], delete: async key => keys.delete(key), open: async () => opened++ } });
	vm.runInContext(source, context);
	for (const event of ['install', 'activate']) {
		let pending;
		handlers[event]({ waitUntil: promise => { pending = promise; } });
		await pending;
	}
	assert.equal(skipped, 1);
	assert.equal(unregistered, 1);
	assert.equal(navigated, 1);
	assert.equal(opened, 0);
	assert.deepEqual([...keys], ['unrelated']);
	handlers.fetch({ respondWith() { assert.fail('native assets must bypass the browser worker'); } });
});

test('branch and release APKs share increasing codes above the legacy installed release', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'fend-android-'));
	try {
		await mkdir(join(dir, 'app'));
		const codes = [];
		for (const [type, name, run] of [['branch', 'main', 17], ['tag', 'v1.0.2', 18], ['branch', 'main', 19]]) {
			await writeFile(join(dir, 'app/build.gradle'), 'android { defaultConfig { versionCode 1 } }\n');
			execFileSync(process.execPath, ['scripts/prepare-android.mjs', dir], { env: {
				...process.env, GITHUB_REF_TYPE: type, GITHUB_REF_NAME: name, GITHUB_RUN_NUMBER: String(run),
				GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', ANDROID_KEYSTORE_BASE64: ''
			}, stdio: 'pipe' });
			const gradle = await readFile(join(dir, 'app/build.gradle'), 'utf8');
			codes.push(Number(gradle.match(/versionCode (\d+)/g).at(-1).match(/\d+/)[0]));
			if (type === 'tag') assert.match(gradle, /versionName "1\.0\.2"/);
		}
		assert(codes[0] > 10001, 'must upgrade the published v1.0.1 APK');
		assert(codes[1] > codes[0]);
		assert(codes[2] > codes[1]);
	} finally { await rm(dir, { recursive: true, force: true }); }
});
