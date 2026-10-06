#!/usr/bin/env node
// Refresh the bundled exchange-rate snapshot (exchange-rates.xml).
//
// Why a snapshot instead of calling the API from the browser: the upstream endpoint
// https://fend.pr.workers.dev/exchange-rates answers with a fixed
// `Access-Control-Allow-Origin: https://printfn.github.io`, so any other origin
// (this PWA on *.github.io, or the APK on https://localhost) is blocked by CORS.
// We therefore vendor the snapshot next to index.html and let scripts/patch-rates.mjs
// rewrite the bundle to fetch it same-origin — which also makes rates work offline.
//
// Usage: node scripts/fetch-rates.mjs
//        npm run rates:update

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'exchange-rates.xml');
const SW = join(ROOT, 'sw.js');
const ENDPOINT = process.env.RATES_ENDPOINT || 'https://fend.pr.workers.dev/exchange-rates';
const MIN_CURRENCIES = 50;

function fail(message) {
	console.error(`[rates] ${message}`);
	process.exit(1);
}

const res = await fetch(ENDPOINT, { headers: { accept: 'text/xml,text/plain,*/*' } });
if (!res.ok) fail(`${ENDPOINT} responded ${res.status} ${res.statusText}`);
const xml = await res.text();

const currencies = [...xml.matchAll(/<f_curr_code>([A-Z]{3})<\/f_curr_code>/g)].map(m => m[1]);
if (!xml.includes('<UN_OPERATIONAL_RATES>') || currencies.length < MIN_CURRENCIES) {
	fail(`response does not look like the UN rates dataset (${currencies.length} currencies parsed)`);
}

const previous = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : '';
const changed = previous !== xml;
writeFileSync(TARGET, xml);
console.log(
	`[rates] exchange-rates.xml: ${currencies.length} currencies, ${Buffer.byteLength(xml)} bytes` +
		(changed ? ' (updated)' : ' (unchanged)')
);

if (!changed) process.exit(0);

// The service worker is cache-first, so returning visitors keep serving the snapshot
// they already have until the cache name changes. Bump it here so a refreshed
// snapshot actually reaches installed clients on their next visit.
const sw = readFileSync(SW, 'utf8');
const match = /const CACHE = 'fend-v(\d+)';/.exec(sw);
if (!match) {
	console.warn('[rates] could not find `const CACHE = \'fend-vN\';` in sw.js — bump it manually');
	process.exit(0);
}
const next = Number(match[1]) + 1;
writeFileSync(SW, sw.replace(match[0], `const CACHE = 'fend-v${next}';`));
console.log(`[rates] sw.js cache bumped: fend-v${match[1]} -> fend-v${next}`);
