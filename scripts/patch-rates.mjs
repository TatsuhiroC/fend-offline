#!/usr/bin/env node
// Inject network-first rates with a bundled offline fallback into build output.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './snapshot-data.mjs';

const dist = process.argv[2] ?? 'www';
const assets = join(dist, 'assets');
const xml = readFileSync(join(dist, 'exchange-rates.xml'), 'utf8');
const { rates, date } = parseSnapshot(xml);
const region = /\/\/#region src\/lib\/exchange-rates\.ts\n[\s\S]*?(?=\/\/#endregion)/;
const runtime = readFileSync(fileURLToPath(new URL('./rates-runtime.js', import.meta.url)), 'utf8')
	.replace('__BUNDLED_RATES__', JSON.stringify([...rates]))
	.replace('__BUNDLED_DATE__', JSON.stringify(date));
const replacement = `//#region src/lib/exchange-rates.ts\n${runtime}\n`;
const bundles = readdirSync(assets).filter(name => /^App-.*\.js$/.test(name));
if (!bundles.length) throw new Error('[rates] no App bundle found');
for (const name of bundles) {
	const file = join(assets, name);
	const source = readFileSync(file, 'utf8');
	if (!region.test(source)) throw new Error(`[rates] upstream exchange-rates region changed in ${name}`);
	const hint = 'fend(input_0, 100, variables)';
	if (!source.includes(hint)) {
		throw new Error(`[rates] upstream evaluation flow changed in ${name}`);
	}
	const patched = source.replace(region, () => replacement)
		.replace(hint, 'fend(input_0, 100, variables, false)');
	writeFileSync(file, patched);
	console.log(`[rates] ${name}: embedded ${rates.size} currencies`);
}
