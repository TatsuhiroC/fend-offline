#!/usr/bin/env node
// Regenerate the service-worker asset list and cache name from the *built* output.
//
// Why: sw.js used to hardcode the hashed asset filenames, so re-syncing the frontend
// from upstream (new hashes) would break `caches.addAll()`. Deriving both the list
// and the cache name from www/ prevents a stale hardcoded precache list,
// and because every shipped file feeds the hash, any content change (including a refreshed
// exchange-rates.xml) automatically invalidates the old cache. No manual `fend-vN` bumps.
//
// Runs on the build output (www/), never on the repo root.
//
// Usage: node scripts/patch-sw.mjs [distDir=www]

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = process.argv[2] ?? 'www';
const swPath = join(dist, 'sw.js');

if (!existsSync(swPath)) {
	console.error(`[sw] ${swPath} not found — run the copy step first`);
	process.exit(1);
}

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		const full = join(dir, entry.name);
		return entry.isDirectory() ? walk(full) : [full];
	});
}

const files = walk(dist)
	.filter(file => file !== swPath && !file.endsWith('.map'))
	.sort();

const nativeConfig = JSON.parse(readFileSync(fileURLToPath(new URL('../capacitor.config.json', import.meta.url)), 'utf8'));
const nativeOrigin = `${nativeConfig.server?.androidScheme ?? 'https'}://${nativeConfig.server?.hostname ?? 'localhost'}`;
const source = readFileSync(swPath, 'utf8').replace(/const NATIVE_ORIGIN = '[^']*';/, `const NATIVE_ORIGIN = '${nativeOrigin}';`);
if (!source.includes(`const NATIVE_ORIGIN = '${nativeOrigin}';`)) throw new Error('[sw] missing native origin declaration');
const hash = createHash('sha256');
// Worker-only fixes also require their own cache.
hash.update(source);
for (const file of files) {
	hash.update(relative(dist, file).split(sep).join('/'));
	hash.update(readFileSync(file));
}
const cacheName = `fend-${hash.digest('hex').slice(0, 10)}`;

const list = ['.', ...files.map(file => './' + relative(dist, file).split(sep).join('/'))];

const patched = source
	.replace(/const CACHE = '[^']*';/, `const CACHE = '${cacheName}';`)
	.replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = ${JSON.stringify(list)};`);

if (patched === source || !patched.includes(`'${cacheName}'`) || !patched.includes(list[list.length - 1])) {
	console.error(`[sw] could not rewrite CACHE/ASSETS in ${swPath} — keep both declarations intact`);
	process.exit(1);
}

writeFileSync(swPath, patched);
console.log(`[sw] ${list.length} entries cached, cache name ${cacheName}`);
