#!/usr/bin/env node
// Inject network-first rates with a bundled offline fallback into build output.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const dates = [...new Set([...xml.matchAll(/<eff_date>([^<]+)<\/eff_date>/g)]
	.map(([, value]) => new Date(value.trim() + ' 00:00:00 UTC').toISOString().slice(0, 10)))].sort();
if (!dates.length) throw new Error('[rates] missing snapshot date');
const date = dates.length === 1 ? dates[0] : `${dates[0]} to ${dates.at(-1)}`;
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
	const oldQuery = `return await query({
			input,
			timeout,
			variables,
			currencyData: await getExchangeRates()
		});`;
	const hint = 'fend(input_0, 100, variables)';
	const signature = 'async function fend(input, timeout, variables)';
	if (!source.includes(oldQuery) || !source.includes(hint) || !source.includes(signature)) {
		throw new Error(`[rates] upstream evaluation flow changed in ${name}`);
	}
	const patched = source.replace(region, () => replacement)
		.replace(signature, 'async function fend(input, timeout, variables, freshRates = true)')
		.replace(hint, 'fend(input_0, 100, variables, false)')
		.replace(oldQuery, `const args = { input, timeout, variables, currencyData: await getExchangeRates() };
		const preview = await query(args);
		if (freshRates && usesCurrency(input, preview)) {
			args.currencyData = await refreshExchangeRates();
			return await query(args);
		}
		return preview;`);
	writeFileSync(file, patched);
	console.log(`[rates] ${name}: embedded ${rates.size} currencies`);
}
