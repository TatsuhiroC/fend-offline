#!/usr/bin/env node
// Embed the snapshot in the build output, leaving upstream assets untouched.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'www';
const assets = join(dist, 'assets');
const xml = readFileSync(join(dist, 'exchange-rates.xml'), 'utf8');
const rates = new Map();
for (const [, row] of xml.matchAll(/<UN_OPERATIONAL_RATES>([\s\S]*?)<\/UN_OPERATIONAL_RATES>/g)) {
	const currency = row.match(/<f_curr_code>([^<]+)<\/f_curr_code>/)?.[1]?.trim();
	const rate = Number(row.match(/<rate>([^<]+)<\/rate>/)?.[1]);
	if (!currency || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(rate) || rate <= 0) {
		throw new Error('[rates] invalid currency row in snapshot');
	}
	rates.set(currency, rate);
}
if (rates.get('USD') !== 1 || !rates.has('CNY') || rates.size < 100) {
	throw new Error('[rates] snapshot is missing required currencies');
}
const region = /\/\/#region src\/lib\/exchange-rates\.ts\n[\s\S]*?(?=\/\/#endregion)/;
const replacement = `//#region src/lib/exchange-rates.ts
// Bundled at build time: no network request can block a calculation.
var exchangeRateCache = new Map(${JSON.stringify([...rates])});
async function getExchangeRates() { return exchangeRateCache; }
`;
const bundles = readdirSync(assets).filter(name => /^App-.*\.js$/.test(name));
if (!bundles.length) throw new Error('[rates] no App bundle found');
for (const name of bundles) {
	const file = join(assets, name);
	const source = readFileSync(file, 'utf8');
	if (!region.test(source)) throw new Error(`[rates] upstream exchange-rates region changed in ${name}`);
	writeFileSync(file, source.replace(region, () => replacement));
	console.log(`[rates] ${name}: embedded ${rates.size} currencies`);
}
