#!/usr/bin/env node
// Rewrite the built bundle so currency rates are fetched from the same-origin snapshot
// instead of https://fend.pr.workers.dev/exchange-rates (which rejects our origin via CORS).
//
// Runs on the *build output* (www/), never on assets/ — the upstream bundle stays pristine
// so it can be re-synced from upstream without losing this patch.
//
// Usage: node scripts/patch-rates.mjs [distDir=www]

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FROM = 'https://fend.pr.workers.dev/exchange-rates';
const TO = './exchange-rates.xml';

const dist = process.argv[2] ?? 'www';
const assetsDir = join(dist, 'assets');

if (!existsSync(join(dist, 'exchange-rates.xml'))) {
	console.error(
		`[rates] ${dist}/exchange-rates.xml is missing — check the copy step or run \`npm run rates:update\``
	);
	process.exit(1);
}
if (!existsSync(assetsDir)) {
	console.error(`[rates] ${assetsDir} not found — run the copy step before patching`);
	process.exit(1);
}

const bundles = readdirSync(assetsDir).filter(name => /^App-.*\.js$/.test(name));
if (bundles.length === 0) {
	console.error(`[rates] no App-*.js bundle found in ${assetsDir}`);
	process.exit(1);
}

let rewritten = 0;
let alreadyPatched = 0;

for (const name of bundles) {
	const path = join(assetsDir, name);
	const source = readFileSync(path, 'utf8');

	if (!source.includes(FROM)) {
		if (source.includes(TO)) alreadyPatched++;
		continue;
	}
	const hits = source.split(FROM).length - 1;
	writeFileSync(path, source.split(FROM).join(TO));
	rewritten++;
	console.log(`[rates] ${name}: ${hits} occurrence(s) -> ${TO}`);
}

if (rewritten > 0) {
	console.log(`[rates] patched ${rewritten} bundle(s); rates are now same-origin and offline-capable`);
} else if (alreadyPatched > 0) {
	console.log(`[rates] already patched (${alreadyPatched} bundle(s))`);
} else {
	console.error(
		`[rates] ${FROM} not found in ${bundles.join(', ')} — upstream changed the endpoint, ` +
			'update scripts/patch-rates.mjs (and check its CORS behaviour) before releasing'
	);
	process.exit(1);
}
