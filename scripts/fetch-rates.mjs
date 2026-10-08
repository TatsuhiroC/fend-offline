#!/usr/bin/env node
// Refresh the last-resort offline exchange-rate snapshot (exchange-rates.xml).
//
// Why a snapshot instead of calling the API from the browser: the upstream endpoint
// https://fend.pr.workers.dev/exchange-rates answers with a fixed
// `Access-Control-Allow-Origin: https://printfn.github.io`, so any other origin
// (this PWA on *.github.io, or the APK on https://localhost) is blocked by CORS.
// We therefore vendor the snapshot and let scripts/patch-rates.mjs embed it into
// the built bundle as a final fallback. Online calculations use Currency API.
//
// Usage: node scripts/fetch-rates.mjs
//        npm run rates:update

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'exchange-rates.xml');
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

const changed = !existsSync(TARGET) || readFileSync(TARGET, 'utf8') !== xml;
if (changed) writeFileSync(TARGET, xml);

// scripts/patch-sw.mjs derives the service-worker cache name from the built files, so a
// refreshed snapshot reaches installed clients on their next visit without any bump here.
console.log(
	`[rates] exchange-rates.xml: ${currencies.length} currencies, ${Buffer.byteLength(xml)} bytes` +
		(changed ? ' (updated)' : ' (unchanged)')
);
