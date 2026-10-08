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

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './snapshot-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'exchange-rates.xml');
const ENDPOINT = process.env.RATES_ENDPOINT || 'https://fend.pr.workers.dev/exchange-rates';

function fail(message) {
	console.error(`[rates] ${message}`);
	process.exit(1);
}

const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(15000), headers: { accept: 'text/xml,text/plain,*/*' } });
if (!res.ok) fail(`${ENDPOINT} responded ${res.status} ${res.statusText}`);
const limit = 512 * 1024;
if (Number(res.headers.get('content-length')) > limit) fail('Snapshot response exceeds 512 KiB');
const chunks = [];
let bytes = 0;
const reader = res.body.getReader();
try {
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		bytes += value.byteLength;
		if (bytes > limit) throw new Error('Snapshot response exceeds 512 KiB');
		chunks.push(Buffer.from(value));
	}
} finally { await reader.cancel().catch(() => {}); }
const xml = Buffer.concat(chunks).toString('utf8');

const { rates } = parseSnapshot(xml);

const changed = !existsSync(TARGET) || readFileSync(TARGET, 'utf8') !== xml;
if (changed) {
	const temporary = TARGET + '.tmp';
	writeFileSync(temporary, xml);
	renameSync(temporary, TARGET);
}

// scripts/patch-sw.mjs derives the service-worker cache name from the built files, so a
// refreshed snapshot reaches installed clients on their next visit without any bump here.
console.log(
	`[rates] exchange-rates.xml: ${rates.size} distinct currencies, ${Buffer.byteLength(xml)} bytes` +
		(changed ? ' (updated)' : ' (unchanged)')
);
