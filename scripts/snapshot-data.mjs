// Shared build/refresh validation. The UN dataset repeats currencies by country.
export function parseSnapshot(xml) {
	if (typeof xml !== 'string' || Buffer.byteLength(xml) > 512 * 1024 ||
		!xml.includes('<UN_OPERATIONAL_RATES_DATASET>') || !xml.trimEnd().endsWith('</UN_OPERATIONAL_RATES_DATASET>')) {
		throw new Error('Invalid or oversized exchange-rate snapshot');
	}
	const rates = new Map();
	const dates = new Set();
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	for (const [, row] of xml.matchAll(/<UN_OPERATIONAL_RATES>([\s\S]*?)<\/UN_OPERATIONAL_RATES>/g)) {
		const currency = row.match(/<f_curr_code>([^<]+)<\/f_curr_code>/)?.[1]?.trim();
		const rateText = row.match(/<rate>([^<]+)<\/rate>/)?.[1]?.trim();
		const rate = Number(rateText);
		const dateText = row.match(/<eff_date>([^<]+)<\/eff_date>/)?.[1]?.trim();
		const parts = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(dateText ?? '');
		if (!currency || !/^[A-Z]{3}$/.test(currency) || !rateText || !Number.isFinite(rate) || rate <= 0 || !parts) {
			throw new Error('Invalid currency row in snapshot');
		}
		const month = months.indexOf(parts[2]);
		const date = new Date(Date.UTC(Number(parts[3]), month, Number(parts[1])));
		if (month < 0 || date.getUTCFullYear() !== Number(parts[3]) || date.getUTCMonth() !== month || date.getUTCDate() !== Number(parts[1])) {
			throw new Error('Invalid snapshot date');
		}
		rates.set(currency, rate);
		dates.add(date.toISOString().slice(0, 10));
	}
	if (rates.size < 100 || rates.get('USD') !== 1 || !rates.has('CNY')) throw new Error('Snapshot is missing required currencies');
	const ordered = [...dates].sort();
	return { rates, date: ordered.length === 1 ? ordered[0] : `${ordered[0]} to ${ordered.at(-1)}` };
}
