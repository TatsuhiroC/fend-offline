// CACHE and ASSETS are rewritten from the complete build output by patch-sw.mjs.
const CACHE = 'fend-dev';
const ASSETS = ['./', './index.html'];
const TIMEOUT = 15000;

self.addEventListener('install', e => {
	e.waitUntil((async () => {
		const cache = await caches.open(CACHE);
		// Keep the previous working version if any offline resource fails to download.
		// Reload bypasses stale HTTP responses for files changed by build patches.
		await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
		// Wait for old windows to close, or an explicit update request. Replacing a
		// worker mid-calculation can mix an old page with the new asset graph.
	})());
});

self.addEventListener('message', e => {
	if (e.data === 'SKIP_WAITING') e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
	e.waitUntil(
		caches.keys().then(keys =>
			Promise.all(keys.filter(k => k.startsWith('fend-') && k !== CACHE).map(k => caches.delete(k)))
		).then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', e => {
	if (e.request.method !== 'GET' || !e.request.url.startsWith(self.registration.scope)) return;
	e.respondWith((async () => {
		const cache = await caches.open(CACHE);
		const cached = await cache.match(e.request);
		if (cached) return cached;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT);
		try {
			const response = await fetch(e.request, { signal: controller.signal });
			if (response.ok) {
				try { await cache.put(e.request, response.clone()); }
				catch (error) { console.warn('[sw] cache write failed', error); }
			}
			return response;
		} catch {
			return new Response('', { status: 504, statusText: 'Gateway Timeout' });
		} finally {
			clearTimeout(timer);
		}
	})());
});
