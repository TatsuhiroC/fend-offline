// Injected into the upstream app bundle by patch-rates.mjs.
var bundledExchangeRates = new Map(__BUNDLED_RATES__);
var bundledRatesDate = __BUNDLED_DATE__;
var currencyStorageKey = 'fend-online-rates-v1';
var currencyRateEndpoints = [
	'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
	'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json'
];
var currencyFetchTimeout = 15000;
var currencyResponseLimit = 128 * 1024;
var currencyRequest;
var exchangeRateCache = bundledExchangeRates;
var exchangeRatesDate = bundledRatesDate;
var exchangeRatesSource = 'bundled';
var currencyRefreshing = false;
var currencyFailure = '';

function parseOnlineRates(data) {
	if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !data.usd || typeof data.usd !== 'object') {
		throw new Error('Invalid exchange-rate response');
	}
	const date = new Date(data.date + 'T00:00:00Z');
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data.date || date.getTime() > Date.now() + 86400000) {
		throw new Error('Invalid exchange-rate date');
	}
	const map = new Map();
	for (const [code, rate] of Object.entries(data.usd)) {
		if (!/^[a-z]{3}$/.test(code)) continue;
		if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) throw new Error('Invalid exchange rate');
		map.set(code.toUpperCase(), rate);
	}
	if (map.size < 100 || map.get('USD') !== 1 || !map.has('CNY')) throw new Error('Incomplete exchange rates');
	for (const code of bundledExchangeRates.keys()) {
		if (!map.has(code)) throw new Error('Missing exchange rate for ' + code);
	}
	return map;
}

function notifyExchangeRates() {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new CustomEvent('fend-rates', { detail: {
		source: exchangeRatesSource, date: exchangeRatesDate, refreshing: currencyRefreshing, failure: currencyFailure
	} }));
}

// Keep the downloaded snapshot outside the service-worker cache so app upgrades
// cannot erase it. Storage can be unavailable in private mode or at quota.
try {
	const saved = JSON.parse(localStorage.getItem(currencyStorageKey));
	exchangeRateCache = parseOnlineRates(saved);
	exchangeRatesDate = saved.date;
	exchangeRatesSource = 'saved';
} catch {}
notifyExchangeRates();

async function getExchangeRates() { return exchangeRateCache; }

async function readCurrencyResponse(response) {
	if (Number(response.headers?.get('content-length')) > currencyResponseLimit) throw new Error('Oversized exchange rates');
	if (!response.body?.getReader) {
		const text = await response.text();
		if (text.length > currencyResponseLimit) throw new Error('Oversized exchange rates');
		return JSON.parse(text);
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let length = 0, text = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > currencyResponseLimit) throw new Error('Oversized exchange rates');
			text += decoder.decode(value, { stream: true });
		}
		return JSON.parse(text + decoder.decode());
	} finally { void reader.cancel().catch(() => {}); }
}

function usesCurrency(input, result) {
	const text = input + ' ' + (result.ok ? result.result : result.message);
	const codes = text.match(/\b[A-Za-z]{3}\b/g) || [];
	return codes.some(code => bundledExchangeRates.has(code.toUpperCase()) || ['BTC', 'ETH', 'XAU', 'XAG'].includes(code.toUpperCase())) ||
		/[$€£¥₹₩₽]|\b(currency|currencies|dollars?|cents?|euros?|pounds?|sterling|yuans?|renminbi|rmb|francs?|yen|rupees?|r[ou]+bles?|won|pesos?|dirhams?|riyals?|dinars?|krona|kroner|shillings?|liras?|reais|baht|ringgit)\b/i.test(text);
}

async function refreshExchangeRates() {
	if (currencyRequest) return currencyRequest;
	currencyRequest = (async () => {
		const controller = new AbortController();
		let timer;
		currencyRefreshing = true;
		currencyFailure = '';
		notifyExchangeRates();
		try {
			// Race mirrors together so neither a blocked mirror nor a short sliced
			// deadline can discard a healthy, slower connection. The deadline covers
			// headers, body reading and validation, and still bounds offline fallback.
			const downloads = currencyRateEndpoints.map(async endpoint => {
				const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
				if (!response.ok) throw new Error('Exchange-rate HTTP ' + response.status);
				const data = await readCurrencyResponse(response);
				const map = parseOnlineRates(data);
				if (exchangeRatesSource !== 'bundled' && data.date < exchangeRatesDate) throw new Error('Exchange rates are older than saved data');
				if (controller.signal.aborted) throw new Error('Exchange-rate request ended');
				return { data, map };
			});
			const { data, map } = await Promise.race([Promise.any(downloads), new Promise((_, reject) => {
				timer = setTimeout(() => {
					const error = new Error('Exchange-rate update timed out');
					error.name = 'TimeoutError';
					reject(error);
					controller.abort();
				}, currencyFetchTimeout);
			})]);
			exchangeRateCache = map;
			exchangeRatesDate = data.date;
			exchangeRatesSource = 'online';
			try { localStorage.setItem(currencyStorageKey, JSON.stringify(data)); } catch {}
		} catch (error) {
			currencyFailure = error?.name === 'TimeoutError' ? 'timeout' : 'unavailable';
			exchangeRatesSource = exchangeRatesSource === 'bundled' ? 'bundled' : 'saved';
		} finally {
			clearTimeout(timer);
			controller.abort();
			currencyRefreshing = false;
			notifyExchangeRates();
		}
		return exchangeRateCache;
	})();
	try { return await currencyRequest; }
	finally { currencyRequest = undefined; }
}

// Prefetch without blocking the calculator. Hints always use the immediately
// available snapshot; submitted currency calculations explicitly request online rates.
void refreshExchangeRates();
if (typeof window !== 'undefined') {
	window.addEventListener('online', () => { void refreshExchangeRates(); });
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void refreshExchangeRates();
	});
}
