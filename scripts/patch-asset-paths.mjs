#!/usr/bin/env node
// Keep upstream assets intact; resolve their deployed /fend/ URLs relative to
// each output module, including the versioned PWA graph and native APK origin.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const assets = join(process.argv[2] ?? 'www', 'assets');
const names = readdirSync(assets);
const updates = [];
let workerPaths = 0, wasmPaths = 0;
for (const name of names.filter(name => name.endsWith('.js'))) {
	const path = join(assets, name);
	const source = readFileSync(path, 'utf8');
	const patched = source.replace(/"\/fend\/assets\/([A-Za-z0-9_.-]+)"/g, (_, asset) => {
		if (!names.includes(asset)) throw new Error('[paths] upstream references a missing asset: ' + asset);
		if (/^worker-.*\.js$/.test(asset)) workerPaths++;
		else if (/^fend_wasm_bg-.*\.wasm$/.test(asset)) wasmPaths++;
		else throw new Error('[paths] unexpected upstream absolute asset: ' + asset);
		return `new URL(${JSON.stringify('./' + asset)}, import.meta.url).href`;
	});
	if (patched.includes('/fend/assets/')) throw new Error('[paths] unrecognized upstream asset URL in ' + name);
	updates.push([path, patched]);
}
if (workerPaths !== 1 || wasmPaths !== 1) throw new Error('[paths] expected exactly one worker and one WASM URL');
for (const [path, source] of updates) writeFileSync(path, source);
console.log('[paths] worker and WASM URLs are module-relative');
